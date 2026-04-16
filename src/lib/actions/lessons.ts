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
  durationMinutes: z.coerce.number().int().min(5).max(480),
  isTrial: z.enum(["true", "false"]).transform((v) => v === "true").optional().default(false),
  communicationMethod: z.enum(["CALL", "CHAT"]).optional(),
  message: z.string().max(500).optional(),
});

export async function createLessonRequest(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const parsed = lessonRequestInputSchema.safeParse({
    coachId: formData.get("coachId"),
    durationMinutes: formData.get("durationMinutes"),
    isTrial: formData.get("isTrial") ?? "false",
    communicationMethod: formData.get("communicationMethod") || undefined,
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { coachId, durationMinutes, isTrial, communicationMethod, message } = parsed.data;

  if (coachId === session.user.id) {
    return { error: "You cannot request a lesson from yourself" };
  }

  // Check suspension
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuspended: true, hasActiveDispute: true, walletBalance: true, reservedBalance: true, freeTrialsRemaining: true, verificationStatus: true },
  });

  if (!currentUser) return { error: "User not found" };
  if (currentUser.isSuspended) {
    return { error: "Your account is under review. Contact support at chesscoach.training@gmail.com" };
  }
  if (currentUser.hasActiveDispute) {
    return { error: "You have an active lesson dispute. Please wait for admin resolution before requesting new lessons." };
  }
  if (currentUser.verificationStatus !== "VERIFIED") {
    return { error: "You must verify your chess.com account before requesting lessons. Visit your profile to get started." };
  }

  // Get coach to calculate price
  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: {
      coachPricePer5Min: true,
      verificationStatus: true,
      activityStatus: true,
      coachAvailability: true,
      lastActiveAt: true,
      communicationPreference: true,
    },
  });

  if (!coach) return { error: "Coach not found" };
  if (coach.verificationStatus !== "VERIFIED") {
    return { error: "Coach is not verified" };
  }
  const effectiveAvailability = getEffectiveAvailability(coach.coachAvailability, coach.lastActiveAt);
  if (effectiveAvailability !== "AVAILABLE") {
    return { error: effectiveAvailability === "BUSY" ? "This coach is currently busy and not accepting new lesson requests" : "This coach is not currently accepting students" };
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
    if (!coach.coachPricePer5Min) return { error: "Coach doesn't offer lessons" };
    const blocks = Math.ceil(durationMinutes / 5);
    estimatedCost = coach.coachPricePer5Min * blocks;
  }

  // Check student wallet (skip for free trials)
  if (!isTrial) {
    const available = currentUser.walletBalance - currentUser.reservedBalance;
    if (available < estimatedCost) {
      return { error: `Insufficient balance. You need €${(estimatedCost / 100).toFixed(2)} but only have €${(available / 100).toFixed(2)} available.` };
    }
  }

  // Prevent duplicate pending requests for the same coach
  const existingPending = await prisma.lessonRequest.findFirst({
    where: {
      studentId: session.user.id,
      coachId,
      status: "PENDING",
    },
  });
  if (existingPending) {
    return { error: "You already have a pending request with this coach" };
  }

  // Create request and reserve funds (or decrement free trial)
  const txOps = [
    prisma.lessonRequest.create({
      data: {
        studentId: session.user.id,
        coachId,
        type: "LESSON",
        durationMinutes,
        estimatedCost,
        isTrial,
        communicationMethod: communicationMethod as "CALL" | "CHAT" | undefined,
        message: message?.trim() || null,
      },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(isTrial
          ? { freeTrialsRemaining: { decrement: 1 } }
          : { reservedBalance: { increment: estimatedCost } }),
        lastActiveAt: new Date(),
        activityStatus: "ACTIVE",
      },
    }),
  ];

  await prisma.$transaction(txOps);

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

  if (action === "accept") {
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          lastActiveAt: new Date(),
          activityStatus: "ACTIVE",
        },
      }),
    ]);
  } else {
    // Decline: release reserved funds. For free trials, restore the trial count.
    const txOps = [
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: { status: "DECLINED", respondedAt: new Date() },
      }),
      ...(request.isTrial
        ? [
            prisma.user.update({
              where: { id: request.studentId },
              data: { freeTrialsRemaining: { increment: 1 } },
            }),
          ]
        : [
            prisma.user.update({
              where: { id: request.studentId },
              data: { reservedBalance: { decrement: request.estimatedCost } },
            }),
          ]),
      prisma.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      }),
    ];
    await prisma.$transaction(txOps);

    // Check for student spam pattern: 5+ declined/cancelled in 7 days
    await checkStudentSpamPattern(request.studentId);
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function confirmLesson(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  if (!requestId || typeof requestId !== "string") return { error: "Invalid request ID" };

  // Use interactive transaction with row-level locking to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Lock the lesson request row to prevent concurrent modifications
    const rows = await tx.$queryRaw<Array<{
      id: string;
      studentId: string;
      coachId: string;
      status: string;
      studentConfirmed: boolean;
      coachConfirmed: boolean;
      estimatedCost: number;
      respondedAt: Date | null;
      durationMinutes: number;
      isTrial: boolean;
    }>>`SELECT * FROM "LessonRequest" WHERE id = ${requestId} FOR UPDATE`;

    const request = rows[0];
    if (!request) return { error: "Request not found" };
    if (request.status !== "IN_PROGRESS") return { error: "Lesson must be in progress first" };

    const isStudent = request.studentId === session.user.id;
    const isCoach = request.coachId === session.user.id;
    if (!isStudent && !isCoach) return { error: "Not authorized" };

    // Cooldown: lesson must have been accepted for at least its duration (min 5 minutes)
    if (request.respondedAt) {
      const minCooldownMs = Math.max(request.durationMinutes * 60 * 1000, 5 * 60 * 1000);
      const elapsed = Date.now() - new Date(request.respondedAt).getTime();
      if (elapsed < minCooldownMs) {
        const remaining = Math.ceil((minCooldownMs - elapsed) / 60000);
        return { error: `Lesson cannot be confirmed yet. Please wait ${remaining} more minute(s).` };
      }
    }

    const updateData: Record<string, boolean> = {};
    if (isStudent) updateData.studentConfirmed = true;
    if (isCoach) updateData.coachConfirmed = true;

    const newStudentConfirmed = isStudent ? true : request.studentConfirmed;
    const newCoachConfirmed = isCoach ? true : request.coachConfirmed;
    const bothConfirmed = newStudentConfirmed && newCoachConfirmed;

    if (bothConfirmed) {
      // Complete the lesson
      await tx.lessonRequest.update({
        where: { id: requestId },
        data: {
          ...updateData,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      if (request.isTrial) {
        // Free trial: no money transfer, just update stats
        await tx.user.update({
          where: { id: request.studentId },
          data: {
            lessonsTaken: { increment: 1 },
            lastActiveAt: new Date(),
            activityStatus: "ACTIVE",
          },
        });
        await tx.user.update({
          where: { id: request.coachId },
          data: {
            lessonsGiven: { increment: 1 },
            lastActiveAt: new Date(),
            activityStatus: "ACTIVE",
          },
        });
      } else {
        // Paid lesson: transfer money
        // Debit student
        await tx.user.update({
          where: { id: request.studentId },
          data: {
            walletBalance: { decrement: request.estimatedCost },
            reservedBalance: { decrement: request.estimatedCost },
            lessonsTaken: { increment: 1 },
            lastActiveAt: new Date(),
            activityStatus: "ACTIVE",
          },
        });
        // Credit coach
        await tx.user.update({
          where: { id: request.coachId },
          data: {
            pendingEarnings: { increment: request.estimatedCost },
            totalEarningsAllTime: { increment: request.estimatedCost },
            lessonsGiven: { increment: 1 },
            lastActiveAt: new Date(),
            activityStatus: "ACTIVE",
          },
        });
        // Record transactions
        await tx.transaction.create({
          data: {
            userId: request.studentId,
            type: "LESSON_PAYMENT",
            amount: -request.estimatedCost,
            lessonRequestId: requestId,
          },
        });
        await tx.transaction.create({
          data: {
            userId: request.coachId,
            type: "LESSON_PAYMENT",
            amount: request.estimatedCost,
            lessonRequestId: requestId,
          },
        });
        // Record earning for ELO
        await tx.earningRecord.create({
          data: {
            userId: request.coachId,
            amount: request.estimatedCost,
          },
        });
      }

      // Update players taught count (distinct students) inside transaction
      const distinctStudents = await tx.lessonRequest.findMany({
        where: { coachId: request.coachId, status: "COMPLETED" },
        select: { studentId: true },
        distinct: ["studentId"],
      });
      await tx.user.update({
        where: { id: request.coachId },
        data: { playersTaught: distinctStudents.length },
      });

      // Recalculate coach ELO immediately
      const newElo = await calculateCoachElo(request.coachId);
      await tx.user.update({
        where: { id: request.coachId },
        data: { coachElo: newElo },
      });
    } else {
      await tx.lessonRequest.update({
        where: { id: requestId },
        data: updateData,
      });
      await tx.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      });
    }

    return { success: true };
  });

  revalidatePath("/dashboard");
  return result;
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

  const txOps = [
    prisma.lessonRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED" },
    }),
    ...(request.isTrial
      ? []
      : [
          prisma.user.update({
            where: { id: request.studentId },
            data: { reservedBalance: { decrement: request.estimatedCost } },
          }),
        ]),
  ];

  await prisma.$transaction(txOps);

  // Check for student spam pattern
  await checkStudentSpamPattern(request.studentId);

  revalidatePath("/dashboard");
  return { success: true };
}

export async function disputeLesson(requestId: string, reason: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  if (!requestId || typeof requestId !== "string") return { error: "Invalid request ID" };
  if (!reason || reason.trim().length < 10) return { error: "Please provide a reason (at least 10 characters)" };
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

export async function submitReview(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const lessonId = formData.get("lessonId") as string;
  const rating = Number(formData.get("rating"));
  const comment = (formData.get("comment") as string) || null;

  if (!lessonId || !rating || rating < 1 || rating > 5) {
    return { error: "Invalid review data" };
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

  const txOps = [
    prisma.lessonRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED" },
    }),
    ...(request.isTrial
      ? []
      : [
          prisma.user.update({
            where: { id: request.studentId },
            data: { reservedBalance: { decrement: request.estimatedCost } },
          }),
        ]),
    prisma.user.update({
      where: { id: session.user.id },
      data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
    }),
  ];

  await prisma.$transaction(txOps);

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
