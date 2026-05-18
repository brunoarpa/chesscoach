"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { headers } from "next/headers";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { getEffectiveAvailability } from "@/lib/utils";
import { calculateCoachElo } from "@/lib/elo";

const lessonRequestInputSchema = z.object({
  coachId: z.string().cuid(),
  timeSlotId: z.string().cuid().optional(),
  isTrial: z.enum(["true", "false"]).transform((v) => v === "true").optional().default(false),
  communicationMethod: z.enum(["CALL", "CHAT"]).optional(),
  message: z.string().max(500).optional(),
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
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { coachId, timeSlotId, isTrial, communicationMethod, message } = parsed.data;

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
    return { error: "Your account is under review. Contact support at chesscoach.training@gmail.com" };
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
      activityStatus: true,
      coachAvailability: true,
      lastActiveAt: true,
      communicationPreference: true,
    },
  });

  if (!coach) return { error: "Coach not found" };
  // chess.com verification is optional — anyone with prices set and AVAILABLE can be booked.
  const effectiveAvailability = getEffectiveAvailability(coach.coachAvailability, coach.lastActiveAt, coach.coachChatPrice, coach.coachCallPrice);
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
    if (currentUser.freeTrialsRemaining <= 0) {
      return { error: "You have no free trials remaining" };
    }

    // Rate limit: max 1 free trial request per hour
    const h = await headers();
    const ip = getClientIpFromHeaders(h);
    const { success: rlSuccess } = await rateLimit(`free-trial:${ip}`, { maxAttempts: 1, windowMs: 60 * 60 * 1000 });
    if (!rlSuccess) {
      return { error: "You can only request one free trial per hour. Please try again later." };
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

    estimatedCost = 0;
  } else {
    // Coaches must successfully complete at least one free trial before receiving paid bookings
    const completedTrials = await prisma.lessonRequest.count({
      where: {
        coachId,
        isTrial: true,
        status: "COMPLETED",
      },
    });
    if (completedTrials === 0) {
      return { error: "This coach hasn't completed a free trial yet. Book a free trial first to try them out." };
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
    estimatedCost = slotPrice; // 1 slot = 15 min
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
    // Slot must be in the future
    if (slot.startTime.getTime() <= now.getTime()) {
      return { error: "This slot has already started" };
    }
    // Max 1 week ahead
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    if (slot.startTime.getTime() > now.getTime() + oneWeekMs) {
      return { error: "You can only book slots up to 1 week in advance" };
    }

    // Coach must accept before the lesson starts (and within 24h max)
    const deadline = new Date(Math.min(
      now.getTime() + 24 * 60 * 60 * 1000,
      slot.startTime.getTime()
    ));

    slotData = {
      timeSlotId: slot.id,
      scheduledStartAt: slot.startTime,
      scheduledEndAt: slot.endTime,
      acceptanceDeadline: deadline,
    };
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
          durationMinutes: 15,
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
  } else {
    // Decline: atomically transition status, then release reserved funds.
    // We do NOT restore the free trial count — students forfeit a trial when
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
  await prisma.$transaction(async (tx) => {
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
  }).catch((err) => {
    if (err instanceof Error && err.message === "ALREADY_PROCESSED") return;
    throw err;
  });

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

  revalidatePath("/dashboard");
  return { success: true };
}

const NO_SHOW_BUFFER_MS = 0; // No grace period — coach must be ready by scheduled start
const NO_SHOW_ELO_PENALTY = 50;

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

    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: { status: "NO_SHOW" },
      }),
      // Make the student whole: refund paid cost, or restore the free trial if it was a trial.
      request.isTrial
        ? prisma.user.update({
            where: { id: request.studentId },
            data: { freeTrialsRemaining: { increment: 1 } },
          })
        : prisma.user.update({
            where: { id: request.studentId },
            data: { reservedBalance: { decrement: request.estimatedCost } },
          }),
      // Apply ELO penalty to coach
      prisma.user.update({
        where: { id: request.coachId },
        data: {
          coachRatingPenalty: { increment: NO_SHOW_ELO_PENALTY },
        },
      }),
      // Release timeslot
      ...(request.timeSlotId
        ? [prisma.timeSlot.update({ where: { id: request.timeSlotId }, data: { status: "AVAILABLE" } })]
        : []),
      prisma.abuseFlag.create({
        data: {
          userId: request.coachId,
          type: "COACH_NO_SHOW",
          severity: "HIGH",
          details: `Coach "${request.coach.username}" did not join lesson with student "${request.student.username}". Student refunded, ELO penalty applied.`,
          relatedLessonId: requestId,
          relatedUserId: request.studentId,
        },
      }),
    ]);

    // Recalculate coach ELO
    const newElo = await calculateCoachElo(request.coachId);
    await prisma.user.update({
      where: { id: request.coachId },
      data: { coachElo: newElo },
    });
  } else {
    // Coach reporting student no-show — coach gets paid
    if (request.studentJoinedAt) {
      return { error: "Student has already joined the lesson" };
    }

    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          coachConfirmed: true,
          studentConfirmed: true,
        },
      }),
      ...(request.isTrial
        ? []
        : [
            // Move from reserved to actual payment
            prisma.user.update({
              where: { id: request.studentId },
              data: {
                reservedBalance: { decrement: request.estimatedCost },
              },
            }),
            prisma.user.update({
              where: { id: request.coachId },
              data: {
                pendingEarnings: { increment: request.estimatedCost },
                totalEarningsAllTime: { increment: request.estimatedCost },
                lessonsGiven: { increment: 1 },
              },
            }),
            prisma.transaction.create({
              data: {
                userId: request.studentId,
                type: "LESSON_PAYMENT",
                amount: -request.estimatedCost,
                lessonRequestId: requestId,
              },
            }),
            prisma.transaction.create({
              data: {
                userId: request.coachId,
                type: "LESSON_PAYMENT",
                amount: request.estimatedCost,
                lessonRequestId: requestId,
              },
            }),
            prisma.earningRecord.create({
              data: {
                userId: request.coachId,
                amount: request.estimatedCost,
              },
            }),
          ]),
      prisma.abuseFlag.create({
        data: {
          userId: request.studentId,
          type: "STUDENT_NO_SHOW",
          severity: "MEDIUM",
          details: `Student "${request.student.username}" did not join lesson with coach "${request.coach.username}". Coach paid for the lesson.`,
          relatedLessonId: requestId,
          relatedUserId: request.coachId,
        },
      }),
    ]);
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

  if (!lessonId || !rating || rating < 1 || rating > 5) {
    return { error: "Invalid review data" };
  }
  if (comment !== null && comment.length > 500) {
    return { error: "Comment must be 500 characters or fewer" };
  }

  const lesson = await prisma.lessonRequest.findUnique({
    where: { id: lessonId },
  });

  if (!lesson) return { error: "Lesson not found" };
  if (lesson.status !== "COMPLETED") return { error: "Lesson must be completed first" };

  const isStudent = lesson.studentId === session.user.id;
  const isCoach = lesson.coachId === session.user.id;
  if (!isStudent && !isCoach) return { error: "Not authorized" };

  // Determine who we're reviewing
  const toUserId = isStudent ? lesson.coachId : lesson.studentId;

  // Only allow one review per user pair (across all lessons)
  const existingReview = await prisma.review.findFirst({
    where: {
      fromUserId: session.user.id,
      toUserId,
      lessonId: { not: lessonId },
    },
  });
  if (existingReview) {
    return { error: "You have already reviewed this person. You can only leave one review per person." };
  }

  // Upsert: create or update review
  await prisma.review.upsert({
    where: { fromUserId_lessonId: { fromUserId: session.user.id, lessonId } },
    create: {
      fromUserId: session.user.id,
      toUserId,
      lessonId,
      rating,
      comment,
    },
    update: {
      rating,
      comment,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/profile`);
  return { success: true };
}

/**
 * Confirm lesson start. Both coach and student must confirm.
 * When both confirm, status moves from ACCEPTED → IN_PROGRESS.
 */
export async function confirmLessonStart(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  if (!requestId || typeof requestId !== "string") return { error: "Invalid request ID" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) return { error: "Request not found" };
  if (request.status !== "ACCEPTED") return { error: "Lesson must be accepted first" };

  const isStudent = request.studentId === session.user.id;
  const isCoach = request.coachId === session.user.id;
  if (!isStudent && !isCoach) return { error: "Not authorized" };

  const updateData: Record<string, boolean> = {};
  if (isStudent) updateData.studentStartConfirmed = true;
  if (isCoach) updateData.coachStartConfirmed = true;

  const newStudentStart = isStudent ? true : request.studentStartConfirmed;
  const newCoachStart = isCoach ? true : request.coachStartConfirmed;
  const bothConfirmed = newStudentStart && newCoachStart;

  if (bothConfirmed) {
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: { ...updateData, status: "IN_PROGRESS" },
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: updateData,
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      }),
    ]);
  }

  revalidatePath("/dashboard");
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

  await prisma.$transaction(async (tx) => {
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
  }).catch((err) => {
    if (err instanceof Error && err.message === "ALREADY_PROCESSED") return;
    throw err;
  });

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

  // Block and cancel any pending requests from this student
  const pendingRequests = await prisma.lessonRequest.findMany({
    where: { coachId: session.user.id, studentId, status: "PENDING" },
  });

  const txOps = [
    prisma.block.create({
      data: { coachId: session.user.id, studentId },
    }),
    ...pendingRequests.map((r) =>
      prisma.lessonRequest.update({
        where: { id: r.id },
        data: { status: "DECLINED", respondedAt: new Date() },
      })
    ),
    ...pendingRequests
      .filter((r) => !r.isTrial)
      .map((r) =>
        prisma.user.update({
          where: { id: studentId },
          data: { reservedBalance: { decrement: r.estimatedCost } },
        })
      ),
  ];

  await prisma.$transaction(txOps);
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
