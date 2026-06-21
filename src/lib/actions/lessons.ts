"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { headers } from "next/headers";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { getEffectiveAvailability, MIN_BOOKING_LEAD_MS, MIN_ACCEPT_NOTICE_MS, NO_SHOW_ELO_PENALTY, STUDENT_CANCEL_CUTOFF_MS, INSTANT_REQUEST_TTL_MS, MAX_CONCURRENT_PENDING_REQUESTS, PAID_REQUEST_RATE_MAX, PAID_REQUEST_RATE_WINDOW_MS, LESSON_DURATION_MINUTES } from "@/lib/utils";
import { calculateCoachElo } from "@/lib/elo";
import { payCoachForLesson, carriedOutTrialWhere } from "@/lib/lesson-ledger";
import { completeInProgressLesson } from "@/lib/activity";
import { createNotification } from "@/lib/notifications";

const lessonRequestInputSchema = z.object({
  coachId: z.string().cuid(),
  // Every booking must target a specific time slot - there is no instant/unscheduled path.
  timeSlotId: z.string().cuid({ message: "Please pick a time slot to book." }),
  isTrial: z.enum(["true", "false"]).transform((v) => v === "true").optional().default(false),
  communicationMethod: z.enum(["CALL", "CHAT"]).optional(),
  message: z.string().max(500).optional(),
  // The price (cents) the student was shown when they clicked Book. If the
  // coach changed their price since the page loaded, the server rejects the
  // booking rather than silently charging the new amount.
  expectedPrice: z.coerce.number().int().nonnegative().optional(),
});

export async function createLessonRequest(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const parsed = lessonRequestInputSchema.safeParse({
    coachId: formData.get("coachId"),
    timeSlotId: formData.get("timeSlotId") || undefined,
    isTrial: formData.get("isTrial") ?? "false",
    communicationMethod: formData.get("communicationMethod") || undefined,
    message: formData.get("message") || undefined,
    expectedPrice: formData.get("expectedPrice") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { coachId, timeSlotId, isTrial, communicationMethod, message, expectedPrice } = parsed.data;

  if (coachId === session.user.id) {
    return { error: "You cannot request a lesson from yourself" };
  }

  // Check suspension
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuspended: true, hasActiveDispute: true, walletBalance: true, reservedBalance: true, freeTrialsRemaining: true },
  });

  if (!currentUser) return { error: "User not found" };
  if (currentUser.isSuspended) {
    return { error: "Your account is under review. Use the contact form at /contact to appeal." };
  }
  if (currentUser.hasActiveDispute) {
    return { error: "You have an active lesson dispute. Please wait for admin resolution before requesting new lessons." };
  }

  // Get coach to calculate price
  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: {
      coachChatPrice: true,
      coachCallPrice: true,
      verificationStatus: true,
      coachAvailability: true,
      communicationPreference: true,
      paidBookingsApproved: true,
      acceptingFreeTrials: true,
    },
  });

  if (!coach) return { error: "Coach not found" };
  // chess.com verification is optional - anyone with prices set and AVAILABLE can be booked.
  const effectiveAvailability = getEffectiveAvailability(coach.coachAvailability, coach.coachChatPrice, coach.coachCallPrice);
  if (effectiveAvailability !== "AVAILABLE") {
    return { error: "This coach is not currently accepting students" };
  }

  // Check if coach has blocked this student
  const blocked = await prisma.block.findUnique({
    where: { coachId_studentId: { coachId, studentId: session.user.id } },
  });
  if (blocked) {
    return { error: "This coach has blocked you from requesting lessons." };
  }

  // Validate communication method against coach preference
  if (communicationMethod === "CALL" && coach.communicationPreference === "CHAT_ONLY") {
    return { error: "This coach only accepts chat-based lessons." };
  }

  // Calculate cost
  let estimatedCost: number;
  if (isTrial) {
    // Free trial: no cost
    if (!coach.acceptingFreeTrials) {
      return { error: "This coach isn't accepting free trials right now. You can still book a paid lesson with them." };
    }
    if (currentUser.freeTrialsRemaining <= 0) {
      return { error: "You have no free trials remaining" };
    }

    // Only allow 1 pending free trial at a time
    const pendingFreeTrial = await prisma.lessonRequest.findFirst({
      where: {
        studentId: session.user.id,
        isTrial: true,
        status: "PENDING",
      },
    });
    if (pendingFreeTrial) {
      return { error: "You already have a pending free trial request. Wait for it to be accepted or declined first." };
    }

    // One free trial per coach. Statuses where the trial never actually
    // happened don't count: DECLINED/EXPIRED/CANCELLED, and NO_SHOW (the
    // coach was the absent party - a student no-show ends as COMPLETED).
    const priorTrialWithCoach = await prisma.lessonRequest.findFirst({
      where: {
        studentId: session.user.id,
        coachId,
        isTrial: true,
        status: { notIn: ["DECLINED", "EXPIRED", "CANCELLED", "NO_SHOW"] },
      },
    });
    if (priorTrialWithCoach) {
      return { error: "You've already used your free trial with this coach. Book a paid lesson to keep learning with them." };
    }

    estimatedCost = 0;
  } else {
    // Coaches must actually carry out at least one free trial before receiving
    // paid bookings (see carriedOutTrialWhere for why COMPLETED alone isn't
    // enough) - unless an admin explicitly approved them for paid bookings.
    if (!coach.paidBookingsApproved) {
      const completedTrials = await prisma.lessonRequest.count({
        where: { coachId, ...carriedOutTrialWhere },
      });
      if (completedTrials === 0) {
        return { error: "This coach hasn't completed a free trial yet. Book a free trial first to try them out." };
      }
    }

    // Determine price based on communication method
    let slotPrice: number;
    if (communicationMethod === "CALL") {
      if (!coach.coachCallPrice) return { error: "Coach doesn't offer call lessons" };
      slotPrice = coach.coachCallPrice;
    } else {
      if (!coach.coachChatPrice) return { error: "Coach doesn't offer chat lessons" };
      slotPrice = coach.coachChatPrice;
    }

    // Guard against a price change between page load and booking: if the
    // coach raised (or lowered) their price after the student saw it, refuse
    // rather than charge a number the student never agreed to. The student's
    // dashboard/profile reload will show the new price for a fresh decision.
    if (expectedPrice !== undefined && expectedPrice !== slotPrice) {
      return {
        error: `This coach's price changed to $${(slotPrice / 100).toFixed(2)} since you opened this page. Refresh and book again if that works for you.`,
      };
    }

    estimatedCost = slotPrice; // 1 slot = 1 lesson (LESSON_DURATION_MINUTES)
  }

  // Check student wallet (skip for free trials)
  if (!isTrial) {
    const available = currentUser.walletBalance - currentUser.reservedBalance;
    if (available < estimatedCost) {
      return { error: `Insufficient balance. You need $${(estimatedCost / 100).toFixed(2)} but only have $${(available / 100).toFixed(2)} available.` };
    }
  }

  // Validate and lock timeslot if provided
  let slotData: { timeSlotId?: string; scheduledStartAt?: Date; scheduledEndAt?: Date; acceptanceDeadline?: Date } = {};
  if (timeSlotId) {
    const slot = await prisma.timeSlot.findUnique({
      where: { id: timeSlotId },
    });
    if (!slot) return { error: "Time slot not found" };
    if (slot.coachId !== coachId) return { error: "Slot does not belong to this coach" };
    if (slot.status !== "AVAILABLE") return { error: "This slot is no longer available" };

    const now = new Date();
    // Slot must start far enough out that the coach has a real window to
    // accept before the acceptance cutoff (start − 15 min).
    if (slot.startTime.getTime() < now.getTime() + MIN_BOOKING_LEAD_MS) {
      return { error: "This slot starts too soon. Pick one at least 30 minutes from now so the coach has time to accept." };
    }
    // Max 1 week ahead
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    if (slot.startTime.getTime() > now.getTime() + oneWeekMs) {
      return { error: "You can only book slots up to 1 week in advance" };
    }

    // Coach must accept within 24h, and no later than 15 min before the start
    // so the student always has notice before a lesson can become real.
    const deadline = new Date(Math.min(
      now.getTime() + 24 * 60 * 60 * 1000,
      slot.startTime.getTime() - MIN_ACCEPT_NOTICE_MS
    ));

    slotData = {
      timeSlotId: slot.id,
      scheduledStartAt: slot.startTime,
      scheduledEndAt: slot.endTime,
      acceptanceDeadline: deadline,
    };
  } else {
    // Instant (no-slot) request: no future start to anchor a deadline to, so
    // give it a short fixed fuse. expirePendingRequests refunds the student
    // once acceptanceDeadline passes, instead of letting it sit for 3 days.
    slotData = {
      acceptanceDeadline: new Date(Date.now() + INSTANT_REQUEST_TTL_MS),
    };
  }

  // Rate-limit free trials: at most 3 trial requests per 30 minutes per IP.
  // Done AFTER all validation so failed requests (invalid slot, no balance, etc.)
  // don't burn the cooldown.
  if (isTrial) {
    const h = await headers();
    const ip = getClientIpFromHeaders(h);
    // Limit per IP *and* per account: the IP headers are forgeable on some
    // hosts, so the account-keyed limit is the one that always holds.
    const [byIp, byUser] = await Promise.all([
      rateLimit(`free-trial:${ip}`, { maxAttempts: 3, windowMs: 30 * 60 * 1000 }),
      rateLimit(`free-trial-user:${session.user.id}`, { maxAttempts: 3, windowMs: 30 * 60 * 1000 }),
    ]);
    if (!byIp.success || !byUser.success) {
      return { error: "You've sent 3 free trial requests recently. Please wait a bit before trying another." };
    }
  } else {
    // Paid requests: cap how many can be pending at once (each reserves funds)
    // and rate-limit bursts so a student can't spam-book across many coaches.
    // Done AFTER all validation so failed requests don't count.
    const pendingPaid = await prisma.lessonRequest.count({
      where: { studentId: session.user.id, isTrial: false, status: "PENDING" },
    });
    if (pendingPaid >= MAX_CONCURRENT_PENDING_REQUESTS) {
      return {
        error: `You already have ${MAX_CONCURRENT_PENDING_REQUESTS} requests waiting for a response. Wait for some to be answered or cancel one before sending more.`,
      };
    }

    const h = await headers();
    const ip = getClientIpFromHeaders(h);
    const [byIp, byUser] = await Promise.all([
      rateLimit(`lesson-request:${ip}`, { maxAttempts: PAID_REQUEST_RATE_MAX, windowMs: PAID_REQUEST_RATE_WINDOW_MS }),
      rateLimit(`lesson-request-user:${session.user.id}`, { maxAttempts: PAID_REQUEST_RATE_MAX, windowMs: PAID_REQUEST_RATE_WINDOW_MS }),
    ]);
    if (!byIp.success || !byUser.success) {
      return { error: "You've sent a lot of requests recently. Please wait a bit before sending more." };
    }
  }

  // Create request and reserve funds (or decrement free trial).
  // Use an interactive transaction with conditional updateMany guards so concurrent
  // requests can't over-reserve, double-spend a trial, or double-book a slot.
  try {
    await prisma.$transaction(async (tx) => {
      // Atomically guard the balance / trial count
      const guard = isTrial
        ? await tx.user.updateMany({
            where: { id: session.user.id, freeTrialsRemaining: { gt: 0 } },
            data: {
              freeTrialsRemaining: { decrement: 1 },
              lastActiveAt: new Date(),
              activityStatus: "ACTIVE",
            },
          })
        : await tx.user.updateMany({
            // reservedBalance + cost <= walletBalance
            where: {
              id: session.user.id,
              reservedBalance: { lte: currentUser.walletBalance - estimatedCost },
            },
            data: {
              reservedBalance: { increment: estimatedCost },
              lastActiveAt: new Date(),
              activityStatus: "ACTIVE",
            },
          });

      if (guard.count === 0) {
        throw new Error(isTrial ? "TRIAL_UNAVAILABLE" : "INSUFFICIENT_BALANCE");
      }

      // Lock the slot atomically if booking one
      if (timeSlotId) {
        const slotLock = await tx.timeSlot.updateMany({
          where: { id: timeSlotId, status: "AVAILABLE" },
          data: { status: "BOOKED" },
        });
        if (slotLock.count === 0) {
          throw new Error("SLOT_TAKEN");
        }
      }

      await tx.lessonRequest.create({
        data: {
          studentId: session.user.id,
          coachId,
          type: "LESSON",
          durationMinutes: LESSON_DURATION_MINUTES,
          estimatedCost,
          isTrial,
          communicationMethod: communicationMethod as "CALL" | "CHAT" | undefined,
          message: message?.trim() || null,
          ...slotData,
        },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "TRIAL_UNAVAILABLE") return { error: "No free trials remaining" };
    if (msg === "INSUFFICIENT_BALANCE") return { error: "Insufficient balance" };
    if (msg === "SLOT_TAKEN") return { error: "This slot was just booked by someone else" };
    return { error: "Booking failed. Please try again." };
  }

  // Notify the coach that a student wants to book a lesson.
  const studentName = session.user.username ?? "A student";
  await createNotification({
    userId: coachId,
    type: "LESSON_REQUESTED",
    title: "New lesson request",
    body: `${studentName} requested a ${isTrial ? "free trial" : `${LESSON_DURATION_MINUTES}-min`} lesson. Accept or decline it from your dashboard.`,
    link: "/dashboard",
    email: { cta: "Review request" },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function respondToLessonRequest(
  requestId: string,
  action: "accept" | "decline"
) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
    include: { student: true, coach: true },
  });

  if (!request) return { error: "Request not found" };
  if (request.coachId !== session.user.id) return { error: "Not authorized" };
  if (request.status !== "PENDING") return { error: "Request is no longer pending" };

  const coachAccount = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuspended: true },
  });
  if (coachAccount?.isSuspended) {
    return { error: "Your account is suspended. You cannot accept lessons. Contact support to appeal." };
  }

  if (action === "accept") {
    // Too late to accept: past the deadline, or inside the 15-min notice
    // window before the start. Don't leave the request dangling PENDING until
    // a sweep finds it - expire it right here (refund/trial restore, slot
    // freed, student notified), exactly like the cron would.
    const nowMs = Date.now();
    const tooLate =
      (request.acceptanceDeadline && new Date(request.acceptanceDeadline).getTime() < nowMs) ||
      (request.scheduledStartAt && new Date(request.scheduledStartAt).getTime() - nowMs < MIN_ACCEPT_NOTICE_MS);
    if (tooLate) {
      const expired = await prisma.$transaction(async (tx) => {
        const flipped = await tx.lessonRequest.updateMany({
          where: { id: requestId, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
        if (flipped.count === 0) return false;
        if (request.isTrial) {
          await tx.user.update({
            where: { id: request.studentId },
            data: { freeTrialsRemaining: { increment: 1 } },
          });
        } else {
          await tx.user.update({
            where: { id: request.studentId },
            data: { reservedBalance: { decrement: request.estimatedCost } },
          });
        }
        if (request.timeSlotId) {
          await tx.timeSlot.update({
            where: { id: request.timeSlotId },
            data: { status: "AVAILABLE" },
          });
        }
        return true;
      });
      if (expired) {
        await createNotification({
          userId: request.studentId,
          type: "LESSON_DECLINED",
          title: "Request expired",
          body: `${request.coach.username ?? "The coach"} didn't respond in time, so your request expired and your ${request.isTrial ? "free trial was restored" : "funds were released"}.`,
          link: "/dashboard",
        });
      }
      revalidatePath("/dashboard");
      return { error: "Too late to accept - lessons must be accepted at least 15 minutes before they start. The request has expired and the student got their money back." };
    }

    // Atomically transition PENDING -> ACCEPTED so concurrent clicks can't double-accept.
    const accepted = await prisma.lessonRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    if (accepted.count === 0) {
      return { error: "Request is no longer pending" };
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
    });
    await createNotification({
      userId: request.studentId,
      type: "LESSON_ACCEPTED",
      title: "Lesson accepted",
      body: `${request.coach.username ?? "Your coach"} accepted your lesson request.`,
      link: `/lesson/${requestId}`,
      email: { cta: "View lesson" },
    });
  } else {
    // Decline: atomically transition status, then release reserved funds.
    // We do NOT restore the free trial count - students forfeit a trial when
    // a coach declines, which deters spam booking across many coaches.
    await prisma.$transaction(async (tx) => {
      const declined = await tx.lessonRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: "DECLINED", respondedAt: new Date() },
      });
      if (declined.count === 0) {
        throw new Error("ALREADY_PROCESSED");
      }

      if (!request.isTrial) {
        await tx.user.update({
          where: { id: request.studentId },
          data: { reservedBalance: { decrement: request.estimatedCost } },
        });
      }

      if (request.timeSlotId) {
        await tx.timeSlot.update({
          where: { id: request.timeSlotId },
          data: { status: "AVAILABLE" },
        });
      }

      await tx.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      });
    }).catch((err) => {
      if (err instanceof Error && err.message === "ALREADY_PROCESSED") return;
      throw err;
    });

    await createNotification({
      userId: request.studentId,
      type: "LESSON_DECLINED",
      title: "Lesson declined",
      body: `${request.coach.username ?? "The coach"} declined your lesson request.${request.isTrial ? "" : " Your funds have been released."}`,
      link: "/dashboard",
      email: { cta: "View dashboard" },
    });

    await checkStudentSpamPattern(request.studentId);
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function cancelLessonRequest(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) return { error: "Request not found" };
  if (request.studentId !== session.user.id) return { error: "Not authorized" };
  if (request.status !== "PENDING") return { error: "Can only cancel pending requests" };

  // Atomic status transition + refund + slot release. If the status has already
  // changed (e.g. coach accepted concurrently), we don't refund twice.
  const didCancel = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.lessonRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count === 0) {
      throw new Error("ALREADY_PROCESSED");
    }
    if (!request.isTrial) {
      await tx.user.update({
        where: { id: request.studentId },
        data: { reservedBalance: { decrement: request.estimatedCost } },
      });
    }
    if (request.timeSlotId) {
      await tx.timeSlot.update({
        where: { id: request.timeSlotId },
        data: { status: "AVAILABLE" },
      });
    }
    return true;
  }).catch((err) => {
    if (err instanceof Error && err.message === "ALREADY_PROCESSED") return false;
    throw err;
  });

  if (didCancel) {
    await createNotification({
      userId: request.coachId,
      type: "LESSON_CANCELLED",
      title: "Lesson request cancelled",
      body: `${session.user.username ?? "A student"} cancelled their pending lesson request.`,
      link: "/dashboard",
    });
  }

  await checkStudentSpamPattern(request.studentId);

  revalidatePath("/dashboard");
  return { success: true };
}

export async function disputeLesson(requestId: string, reason: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  if (!requestId || typeof requestId !== "string") return { error: "Invalid request ID" };
  if (!reason || reason.trim().length < 30) return { error: "Please describe the issue in a sentence (at least 30 characters)" };
  if (reason.length > 1000) return { error: "Reason must be under 1000 characters" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
  });

  if (!request) return { error: "Request not found" };
  if (request.studentId !== session.user.id) return { error: "Only the student can dispute a lesson" };
  if (request.status !== "ACCEPTED" && request.status !== "IN_PROGRESS") return { error: "Lesson must be active to dispute" };

  await prisma.$transaction([
    prisma.lessonRequest.update({
      where: { id: requestId },
      data: {
        status: "DISPUTED",
        disputeReason: reason.trim(),
      },
    }),
    prisma.user.update({
      where: { id: request.studentId },
      data: {
        hasActiveDispute: true,
        lastActiveAt: new Date(),
        activityStatus: "ACTIVE",
      },
    }),
    prisma.abuseFlag.create({
      data: {
        userId: request.studentId,
        type: "LESSON_DISPUTE",
        severity: "HIGH",
        details: `Student "${request.student.username}" disputed lesson with coach "${request.coach.username}". Reason: ${reason.trim()}`,
        relatedLessonId: requestId,
        relatedUserId: request.coachId,
      },
    }),
  ]);

  await createNotification({
    userId: request.coachId,
    type: "LESSON_DISPUTED",
    title: "Lesson disputed",
    body: `${request.student.username ?? "A student"} opened a dispute on a lesson. Our team will review it.`,
    link: "/dashboard",
  });

  revalidatePath("/dashboard");
  return { success: true };
}

const NO_SHOW_BUFFER_MS = 0; // No grace period - coach must be ready by scheduled start
// A student, however, gets a grace window before the coach can charge them as a
// no-show: being a couple of minutes late must not cost the full lesson price.
const STUDENT_NO_SHOW_GRACE_MS = 10 * 60 * 1000;

export async function reportNoShow(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
  });

  if (!request) return { error: "Request not found" };

  const isCoach = request.coachId === session.user.id;
  const isStudent = request.studentId === session.user.id;
  if (!isCoach && !isStudent) return { error: "Not authorized" };

  if (request.status !== "ACCEPTED" && request.status !== "IN_PROGRESS") {
    return { error: "Lesson must be active to report a no-show" };
  }

  if (!request.scheduledStartAt) {
    return { error: "No scheduled start time" };
  }

  const now = Date.now();
  const startTime = new Date(request.scheduledStartAt).getTime();

  if (now < startTime + NO_SHOW_BUFFER_MS) {
    return { error: "You can only report a no-show after the scheduled start time." };
  }

  if (isStudent) {
    // Student reporting coach no-show
    if (request.coachJoinedAt) {
      return { error: "Coach has already joined the lesson" };
    }
    // The reporter must have shown up themselves. If neither party joined,
    // the auto-sweep expires the lesson with a full refund and no ELO
    // penalty - letting an absent student report would pin an unfair
    // penalty on an equally absent coach.
    if (!request.studentJoinedAt) {
      return { error: "Join the lesson room first - if the coach doesn't show up, report it from there. If neither of you joins, the lesson expires on its own with a full refund." };
    }

    const claimed = await prisma.$transaction(async (tx) => {
      // Atomically claim the lesson so a concurrent cron sweep or the coach's
      // own report can't process (and refund) it twice.
      const flipped = await tx.lessonRequest.updateMany({
        where: { id: requestId, status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
        data: { status: "NO_SHOW" },
      });
      if (flipped.count === 0) return false;

      // Make the student whole: refund paid cost, or restore the free trial if it was a trial.
      if (request.isTrial) {
        await tx.user.update({
          where: { id: request.studentId },
          data: { freeTrialsRemaining: { increment: 1 } },
        });
      } else {
        await tx.user.update({
          where: { id: request.studentId },
          data: { reservedBalance: { decrement: request.estimatedCost } },
        });
      }
      // Apply ELO penalty to coach
      await tx.user.update({
        where: { id: request.coachId },
        data: { coachRatingPenalty: { increment: NO_SHOW_ELO_PENALTY } },
      });
      // Release timeslot
      if (request.timeSlotId) {
        await tx.timeSlot.update({
          where: { id: request.timeSlotId },
          data: { status: "AVAILABLE" },
        });
      }
      await tx.abuseFlag.create({
        data: {
          userId: request.coachId,
          type: "COACH_NO_SHOW",
          severity: "HIGH",
          details: `Coach "${request.coach.username}" did not join lesson with student "${request.student.username}". Student refunded, ELO penalty applied.`,
          relatedLessonId: requestId,
          relatedUserId: request.studentId,
        },
      });
      // Recalculate coach ELO inside the transaction so it reflects the penalty
      // atomically (matches the auto-complete path).
      const newElo = await calculateCoachElo(request.coachId, tx);
      await tx.user.update({
        where: { id: request.coachId },
        data: { coachElo: newElo },
      });
      return true;
    });

    if (!claimed) return { error: "This lesson has already been processed" };

    await createNotification({
      userId: request.coachId,
      type: "COACH_NO_SHOW",
      title: "No-show reported",
      body: `${request.student.username ?? "A student"} reported that you did not join the scheduled lesson. They were refunded.`,
      link: "/dashboard",
    });
  } else {
    // Coach reporting student no-show - coach gets paid
    if (request.studentJoinedAt) {
      return { error: "Student has already joined the lesson" };
    }
    // The reporter must have shown up themselves - a coach who also skipped
    // the lesson must not be able to charge the student for it. The
    // auto-sweep handles the neither-joined case as a no-payment expiry.
    if (!request.coachJoinedAt) {
      return { error: "Join the lesson room first - a no-show can only be reported by the party who showed up. If neither of you joins, the lesson expires with no payment." };
    }

    if (now < startTime + STUDENT_NO_SHOW_GRACE_MS) {
      return { error: "Give the student a few more minutes - you can report a no-show 10 minutes after the scheduled start." };
    }

    const claimed = await prisma.$transaction(async (tx) => {
      const flipped = await tx.lessonRequest.updateMany({
        where: { id: requestId, status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          coachConfirmed: true,
          studentConfirmed: true,
        },
      });
      if (flipped.count === 0) return false;

      await payCoachForLesson(tx, request);
      // Ghosting a free trial forfeits the rest: trials are free for the
      // student but cost the coach a held slot, so one no-show ends them.
      if (request.isTrial) {
        await tx.user.update({
          where: { id: request.studentId },
          data: { freeTrialsRemaining: 0 },
        });
      }
      await tx.abuseFlag.create({
        data: {
          userId: request.studentId,
          type: "STUDENT_NO_SHOW",
          severity: "MEDIUM",
          details: `Student "${request.student.username}" did not join lesson with coach "${request.coach.username}". ${request.isTrial ? "Trial forfeited, remaining free trials revoked." : "Coach paid for the lesson."}`,
          relatedLessonId: requestId,
          relatedUserId: request.coachId,
        },
      });
      return true;
    });

    if (!claimed) return { error: "This lesson has already been processed" };

    await createNotification({
      userId: request.studentId,
      type: "STUDENT_NO_SHOW",
      title: "No-show recorded",
      body: `${request.coach.username ?? "Your coach"} reported that you did not join the scheduled lesson. ${request.isTrial ? "Your remaining free trials were forfeited." : "The lesson was charged."}`,
      link: "/dashboard",
    });
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Student confirms a finished lesson was satisfactory, releasing payment to
 * the coach immediately instead of waiting out the 24h dispute window.
 * Voluntary and strictly student-initiated: the coach gets paid either way
 * once the window lapses, so this only ever accelerates, never changes, the
 * outcome.
 */
export async function confirmLessonCompletion(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
  });

  if (!request) return { error: "Request not found" };
  if (request.studentId !== session.user.id) {
    return { error: "Only the student can confirm a lesson" };
  }
  if (request.status !== "IN_PROGRESS") {
    return { error: "This lesson can't be confirmed right now" };
  }
  // Only after the scheduled end - during the lesson the room is still live,
  // and before IN_PROGRESS the no-show flows own the lesson.
  if (!request.scheduledEndAt || Date.now() < new Date(request.scheduledEndAt).getTime()) {
    return { error: "You can confirm once the lesson has ended" };
  }

  const completed = await completeInProgressLesson(request);
  if (!completed) {
    return { error: "This lesson has already been processed" };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function submitReview(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const lessonId = formData.get("lessonId") as string;
  const rating = Number(formData.get("rating"));
  const comment = (formData.get("comment") as string) || null;

  if (!lessonId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Invalid review data" };
  }
  if (comment !== null && comment.length > 500) {
    return { error: "Comment must be 500 characters or fewer" };
  }

  const lesson = await prisma.lessonRequest.findUnique({
    where: { id: lessonId },
    select: {
      studentId: true,
      coachId: true,
      status: true,
      coachJoinedAt: true,
      studentJoinedAt: true,
    },
  });

  if (!lesson) return { error: "Lesson not found" };
  if (lesson.status !== "COMPLETED") return { error: "Lesson must be completed first" };

  const isStudent = lesson.studentId === session.user.id;
  const isCoach = lesson.coachId === session.user.id;
  if (!isStudent && !isCoach) return { error: "Not authorized" };

  // A lesson only counts as having "happened" if both parties actually joined.
  // A student no-show still ends COMPLETED (the coach is paid), but the absent
  // student must not be able to review the coach they ghosted, and vice versa.
  if (!lesson.coachJoinedAt || !lesson.studentJoinedAt) {
    return { error: "You can only review a lesson that actually took place." };
  }

  // Determine who we're reviewing
  const toUserId = isStudent ? lesson.coachId : lesson.studentId;

  // One review per person (across all lessons). If this user already reviewed
  // this person on any lesson, update that review rather than erroring - the
  // dashboard prompts on the most recent completed lesson, which may differ
  // from the one the original review is anchored to.
  const existingReview = await prisma.review.findFirst({
    where: { fromUserId: session.user.id, toUserId },
    select: { id: true },
  });
  if (existingReview) {
    await prisma.review.update({
      where: { id: existingReview.id },
      data: { rating, comment },
    });
  } else {
    await prisma.review.create({
      data: { fromUserId: session.user.id, toUserId, lessonId, rating, comment },
    });
  }

  await createNotification({
    userId: toUserId,
    type: "REVIEW_RECEIVED",
    title: "New review",
    body: `${session.user.username ?? "Someone"} left you a ${rating}★ review.`,
    link: "/dashboard",
  });

  revalidatePath("/dashboard");
  revalidatePath(`/profile`);
  return { success: true };
}

/**
 * Decline an accepted lesson before it starts.
 * Either coach or student can do this. Full refund, no admin needed.
 */
export async function declineAcceptedLesson(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) return { error: "Request not found" };
  if (request.status !== "ACCEPTED") return { error: "Can only decline accepted lessons that haven't started yet" };

  const isStudent = request.studentId === session.user.id;
  const isCoach = request.coachId === session.user.id;
  if (!isStudent && !isCoach) return { error: "Not authorized" };

  // Once the scheduled start has passed, cancellation is no longer an option:
  // a party who didn't show could otherwise cancel to dodge the no-show
  // consequences (the coach's ELO penalty, or the student's lesson charge).
  // The no-show report / auto-detection owns the lesson from this point.
  if (request.scheduledStartAt && Date.now() >= new Date(request.scheduledStartAt).getTime()) {
    return { error: "This lesson has already started. If the other person didn't show up, report a no-show instead." };
  }

  // Students are locked in shortly before the start: a free last-second
  // cancellation would let them ghost the coach's committed slot at no cost.
  // Coaches may still cancel up to the start - that refunds the student in
  // full, which is strictly better for the student than a coach no-show.
  if (
    isStudent &&
    request.scheduledStartAt &&
    Date.now() >= new Date(request.scheduledStartAt).getTime() - STUDENT_CANCEL_CUTOFF_MS
  ) {
    const cutoffMin = Math.round(STUDENT_CANCEL_CUTOFF_MS / 60000);
    return { error: `Lessons can no longer be cancelled within ${cutoffMin} minutes of the start time. If your coach doesn't show up, report a no-show for a full refund.` };
  }

  const didDecline = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.lessonRequest.updateMany({
      where: { id: requestId, status: "ACCEPTED" },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count === 0) {
      throw new Error("ALREADY_PROCESSED");
    }
    if (!request.isTrial) {
      await tx.user.update({
        where: { id: request.studentId },
        data: { reservedBalance: { decrement: request.estimatedCost } },
      });
    }
    if (request.timeSlotId) {
      await tx.timeSlot.update({
        where: { id: request.timeSlotId },
        data: { status: "AVAILABLE" },
      });
    }
    await tx.user.update({
      where: { id: session.user.id },
      data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
    });
    return true;
  }).catch((err) => {
    if (err instanceof Error && err.message === "ALREADY_PROCESSED") return false;
    throw err;
  });

  if (didDecline) {
    // Notify whichever party didn't initiate the cancellation.
    const otherUserId = isStudent ? request.coachId : request.studentId;
    await createNotification({
      userId: otherUserId,
      type: "LESSON_CANCELLED",
      title: "Scheduled lesson cancelled",
      body: `${session.user.username ?? (isStudent ? "The student" : "The coach")} cancelled a scheduled lesson. ${request.isTrial ? "" : "Funds were released."}`.trim(),
      link: "/dashboard",
    });
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Toggle a coach as favourite for the current user.
 */
export async function toggleFavourite(coachId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  if (coachId === session.user.id) return { error: "You cannot favourite yourself" };

  const existing = await prisma.favourite.findUnique({
    where: { userId_coachId: { userId: session.user.id, coachId } },
  });

  if (existing) {
    await prisma.favourite.delete({ where: { id: existing.id } });
    revalidatePath("/dashboard");
    revalidatePath("/search");
    return { favourited: false };
  } else {
    await prisma.favourite.create({
      data: { userId: session.user.id, coachId },
    });
    revalidatePath("/dashboard");
    revalidatePath("/search");
    return { favourited: true };
  }
}

/**
 * Coach blocks a student. Also cancels any pending requests from that student.
 */
export async function blockStudent(studentId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  if (studentId === session.user.id) return { error: "You cannot block yourself" };

  const existing = await prisma.block.findUnique({
    where: { coachId_studentId: { coachId: session.user.id, studentId } },
  });
  if (existing) return { error: "Student is already blocked" };

  // Block and decline any pending requests from this student. Each decline is
  // guarded on the PENDING status so a request the coach accepts (or that
  // expires) concurrently isn't double-processed: we only refund the reserved
  // hold and release the booked slot for requests we actually flip here.
  const pendingRequests = await prisma.lessonRequest.findMany({
    where: { coachId: session.user.id, studentId, status: "PENDING" },
  });

  await prisma.$transaction(async (tx) => {
    await tx.block.create({
      data: { coachId: session.user.id, studentId },
    });
    for (const r of pendingRequests) {
      const declined = await tx.lessonRequest.updateMany({
        where: { id: r.id, status: "PENDING" },
        data: { status: "DECLINED", respondedAt: new Date() },
      });
      if (declined.count === 0) continue;
      if (!r.isTrial) {
        await tx.user.update({
          where: { id: studentId },
          data: { reservedBalance: { decrement: r.estimatedCost } },
        });
      }
      // Release any booked timeslot so it doesn't stay locked forever.
      if (r.timeSlotId) {
        await tx.timeSlot.update({
          where: { id: r.timeSlotId },
          data: { status: "AVAILABLE" },
        });
      }
    }
  });

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Coach unblocks a student.
 */
export async function unblockStudent(studentId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  await prisma.block.deleteMany({
    where: { coachId: session.user.id, studentId },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Check if a student has a suspicious pattern of declined/cancelled requests.
 * 5+ in 7 days triggers an abuse flag.
 */
async function checkStudentSpamPattern(studentId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentDeclinedCancelled = await prisma.lessonRequest.count({
    where: {
      studentId,
      status: { in: ["DECLINED", "CANCELLED"] },
      createdAt: { gte: sevenDaysAgo },
    },
  });

  if (recentDeclinedCancelled >= 5) {
    // Check if we already flagged this recently (avoid duplicate flags)
    const recentFlag = await prisma.abuseFlag.findFirst({
      where: {
        userId: studentId,
        type: "STUDENT_SPAM",
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (!recentFlag) {
      await prisma.abuseFlag.create({
        data: {
          userId: studentId,
          type: "STUDENT_SPAM",
          severity: "MEDIUM",
          details: `${recentDeclinedCancelled} declined/cancelled lesson requests in the last 7 days.`,
        },
      });
    }
  }
}
