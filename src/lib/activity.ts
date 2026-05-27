import { prisma } from "@/lib/prisma";
import { calculateCoachElo } from "@/lib/elo";

/**
 * Update activity status for all users based on lastActiveAt.
 * - Active: within 24 hours
 * - Away: 1-2 days + has pending requests  
 * - Inactive: 2+ days or hasn't responded to requests in 2+ days
 */
export async function updateActivityStatuses() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  // Set INACTIVE: no activity in 2+ days
  await prisma.user.updateMany({
    where: {
      lastActiveAt: { lt: twoDaysAgo },
      activityStatus: { not: "INACTIVE" },
    },
    data: { activityStatus: "INACTIVE" },
  });

  // Find users with pending requests older than 2 days (unresponsive coaches)
  const unresponsiveCoachIds = await prisma.lessonRequest.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: twoDaysAgo },
    },
    select: { coachId: true },
    distinct: ["coachId"],
  });

  if (unresponsiveCoachIds.length > 0) {
    await prisma.user.updateMany({
      where: {
        id: { in: unresponsiveCoachIds.map((r: { coachId: string }) => r.coachId) },
        activityStatus: { not: "INACTIVE" },
      },
      data: { activityStatus: "INACTIVE" },
    });
  }

  // Set AWAY: 1-2 days inactive and has pending requests
  const awayCoachIds = await prisma.lessonRequest.findMany({
    where: {
      status: "PENDING",
    },
    select: { coachId: true },
    distinct: ["coachId"],
  });

  if (awayCoachIds.length > 0) {
    await prisma.user.updateMany({
      where: {
        id: { in: awayCoachIds.map((r: { coachId: string }) => r.coachId) },
        lastActiveAt: { lt: oneDayAgo, gte: twoDaysAgo },
        activityStatus: "ACTIVE",
      },
      data: { activityStatus: "AWAY" },
    });
  }

  // Set ACTIVE: anyone active in last 24h
  await prisma.user.updateMany({
    where: {
      lastActiveAt: { gte: oneDayAgo },
      activityStatus: { not: "ACTIVE" },
    },
    data: { activityStatus: "ACTIVE" },
  });

  // Auto-set coaches to UNAVAILABLE if inactive for 24+ hours.
  // "Coach" = anyone with a price set; chess.com verification is optional.
  await prisma.user.updateMany({
    where: {
      lastActiveAt: { lt: oneDayAgo },
      coachAvailability: { not: "UNAVAILABLE" },
      OR: [
        { coachChatPrice: { not: null } },
        { coachCallPrice: { not: null } },
      ],
    },
    data: { coachAvailability: "UNAVAILABLE" },
  });
}

/**
 * Expire pending lesson requests older than 3 days
 */
export async function expirePendingRequests() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Expire requests that are either older than 3 days OR past their acceptance deadline
  const expiredRequests = await prisma.lessonRequest.findMany({
    where: {
      status: "PENDING",
      OR: [
        { createdAt: { lt: threeDaysAgo } },
        { acceptanceDeadline: { lt: now } },
      ],
    },
  });

  for (const request of expiredRequests) {
    // Atomic PENDING -> EXPIRED transition; only refund if we actually flipped it.
    await prisma.$transaction(async (tx) => {
      const expired = await tx.lessonRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      if (expired.count === 0) return;
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
    });
  }

  // Check for coach non-responsive pattern: 3+ expired in 7 days
  await detectNonResponsiveCoaches();
}

/**
 * Detect coaches who consistently don't respond to requests.
 * 3+ expired requests in 7 days triggers an abuse flag.
 */
async function detectNonResponsiveCoaches() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const nonResponsiveCoaches = await prisma.lessonRequest.groupBy({
    by: ["coachId"],
    where: {
      status: "EXPIRED",
      createdAt: { gte: sevenDaysAgo },
    },
    _count: { id: true },
    having: {
      id: { _count: { gte: 3 } },
    },
  });

  for (const coach of nonResponsiveCoaches) {
    // Avoid duplicate flags
    const recentFlag = await prisma.abuseFlag.findFirst({
      where: {
        userId: coach.coachId,
        type: "COACH_NON_RESPONSIVE",
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (!recentFlag) {
      await prisma.abuseFlag.create({
        data: {
          userId: coach.coachId,
          type: "COACH_NON_RESPONSIVE",
          severity: "LOW",
          details: `${coach._count.id} lesson requests expired (unanswered) in the last 7 days.`,
        },
      });
    }
  }
}

/**
 * Detect confirmation timeouts and one-sided confirmations.
 * Called by daily cron. Checks ACCEPTED lessons where the confirmation
 * window has passed (cooldown + 48 hours).
 */
export async function detectConfirmationDisputes() {
  // Find ACCEPTED lessons where respondedAt + duration + 48h < now
  // Exclude DISPUTED lessons — those are handled by admin
  const acceptedLessons = await prisma.lessonRequest.findMany({
    where: {
      status: "ACCEPTED",
      respondedAt: { not: null },
    },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
  });

  const now = Date.now();
  const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours after cooldown

  for (const lesson of acceptedLessons) {
    if (!lesson.respondedAt) continue;

    const cooldownMs = Math.max(lesson.durationMinutes * 60 * 1000, 5 * 60 * 1000);
    const deadline = new Date(lesson.respondedAt).getTime() + cooldownMs + DISPUTE_WINDOW_MS;

    if (now <= deadline) continue; // Not yet past the window

    const studentConfirmed = lesson.studentConfirmed;
    const coachConfirmed = lesson.coachConfirmed;

    if (!studentConfirmed && !coachConfirmed) {
      // Neither confirmed — timeout, expire and refund
      const txOps = [
        prisma.lessonRequest.update({
          where: { id: lesson.id },
          data: { status: "EXPIRED" },
        }),
        ...(lesson.isTrial
          ? []
          : [
              prisma.user.update({
                where: { id: lesson.studentId },
                data: { reservedBalance: { decrement: lesson.estimatedCost } },
              }),
            ]),
      ];
      await prisma.$transaction(txOps);

      await prisma.abuseFlag.create({
        data: {
          userId: lesson.studentId,
          type: "CONFIRMATION_TIMEOUT",
          severity: "LOW",
          details: `Neither party confirmed lesson completion. Student: ${lesson.student.username}, Coach: ${lesson.coach.username}. Lesson expired and funds returned.`,
          relatedLessonId: lesson.id,
          relatedUserId: lesson.coachId,
        },
      });
    } else if (coachConfirmed && !studentConfirmed) {
      // Coach confirmed but student didn't respond within 48h — auto-complete
      // (student silence = satisfaction)
      const txOps = [
        prisma.lessonRequest.update({
          where: { id: lesson.id },
          data: {
            status: "COMPLETED",
            studentConfirmed: true,
            completedAt: new Date(),
          },
        }),
        ...(lesson.isTrial
          ? []
          : [
              prisma.user.update({
                where: { id: lesson.studentId },
                data: {
                  walletBalance: { decrement: lesson.estimatedCost },
                  reservedBalance: { decrement: lesson.estimatedCost },
                  lessonsTaken: { increment: 1 },
                },
              }),
              prisma.user.update({
                where: { id: lesson.coachId },
                data: {
                  pendingEarnings: { increment: lesson.estimatedCost },
                  totalEarningsAllTime: { increment: lesson.estimatedCost },
                  lessonsGiven: { increment: 1 },
                },
              }),
              prisma.transaction.create({
                data: {
                  userId: lesson.studentId,
                  type: "LESSON_PAYMENT",
                  amount: -lesson.estimatedCost,
                  lessonRequestId: lesson.id,
                },
              }),
              prisma.transaction.create({
                data: {
                  userId: lesson.coachId,
                  type: "LESSON_PAYMENT",
                  amount: lesson.estimatedCost,
                  lessonRequestId: lesson.id,
                },
              }),
              prisma.earningRecord.create({
                data: {
                  userId: lesson.coachId,
                  amount: lesson.estimatedCost,
                },
              }),
            ]),
      ];
      await prisma.$transaction(txOps);
    } else {
      // Student confirmed but coach didn't — expire and refund
      const flaggedUserId = lesson.coachId;
      const relatedUserId = lesson.studentId;

      // Expire and refund
      const txOps = [
        prisma.lessonRequest.update({
          where: { id: lesson.id },
          data: { status: "EXPIRED" },
        }),
        ...(lesson.isTrial
          ? []
          : [
              prisma.user.update({
                where: { id: lesson.studentId },
                data: { reservedBalance: { decrement: lesson.estimatedCost } },
              }),
            ]),
      ];
      await prisma.$transaction(txOps);

      await prisma.abuseFlag.create({
        data: {
          userId: flaggedUserId,
          type: "ONE_SIDED_CONFIRMATION",
          severity: "MEDIUM",
          details: `Student confirmed but coach did not within 48h. Student: ${lesson.student.username}, Coach: ${lesson.coach.username}. Lesson expired and funds returned.`,
          relatedLessonId: lesson.id,
          relatedUserId,
        },
      });
    }
  }
}

const NO_SHOW_BUFFER_MS = 0; // No grace — coach must be ready by scheduled start
const NO_SHOW_ELO_PENALTY = 50;

// Window after the lesson's scheduled end during which a student can report
// the lesson as unsatisfactory. Once this elapses, the lesson auto-completes
// and the coach is paid.
export const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the moment at which an IN_PROGRESS lesson will auto-complete.
 * Falls back to respondedAt + duration when scheduledEndAt is missing.
 */
export function getAutoCompleteAt(lesson: {
  scheduledEndAt: Date | null;
  respondedAt: Date | null;
  durationMinutes: number;
}): Date | null {
  if (lesson.scheduledEndAt) {
    return new Date(lesson.scheduledEndAt.getTime() + DISPUTE_WINDOW_MS);
  }
  if (lesson.respondedAt) {
    return new Date(
      lesson.respondedAt.getTime() +
        lesson.durationMinutes * 60 * 1000 +
        DISPUTE_WINDOW_MS,
    );
  }
  return null;
}

/**
 * Auto-complete IN_PROGRESS lessons whose dispute window has elapsed.
 * Student silence = satisfaction: payment transfers to the coach.
 */
export async function autoCompleteLessons() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - DISPUTE_WINDOW_MS);

  const lessons = await prisma.lessonRequest.findMany({
    where: {
      status: "IN_PROGRESS",
      scheduledEndAt: { not: null, lte: cutoff },
    },
  });

  for (const lesson of lessons) {
    await prisma.$transaction(async (tx) => {
      // Re-check status under the implicit row state to avoid double-processing.
      const fresh = await tx.lessonRequest.findUnique({
        where: { id: lesson.id },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "IN_PROGRESS") return;

      await tx.lessonRequest.update({
        where: { id: lesson.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          studentConfirmed: true,
          coachConfirmed: true,
        },
      });

      if (!lesson.isTrial) {
        await tx.user.update({
          where: { id: lesson.studentId },
          data: {
            walletBalance: { decrement: lesson.estimatedCost },
            reservedBalance: { decrement: lesson.estimatedCost },
            lessonsTaken: { increment: 1 },
          },
        });
        await tx.user.update({
          where: { id: lesson.coachId },
          data: {
            pendingEarnings: { increment: lesson.estimatedCost },
            totalEarningsAllTime: { increment: lesson.estimatedCost },
            lessonsGiven: { increment: 1 },
          },
        });
        await tx.transaction.create({
          data: {
            userId: lesson.studentId,
            type: "LESSON_PAYMENT",
            amount: -lesson.estimatedCost,
            lessonRequestId: lesson.id,
          },
        });
        await tx.transaction.create({
          data: {
            userId: lesson.coachId,
            type: "LESSON_PAYMENT",
            amount: lesson.estimatedCost,
            lessonRequestId: lesson.id,
          },
        });
        await tx.earningRecord.create({
          data: { userId: lesson.coachId, amount: lesson.estimatedCost },
        });
      }

      // Free trials don't count toward playersTaught / lessonsGiven stats.
      const distinctStudents = await tx.lessonRequest.findMany({
        where: { coachId: lesson.coachId, status: "COMPLETED", isTrial: false },
        select: { studentId: true },
        distinct: ["studentId"],
      });
      await tx.user.update({
        where: { id: lesson.coachId },
        data: { playersTaught: distinctStudents.length },
      });

      const newElo = await calculateCoachElo(lesson.coachId, tx);
      await tx.user.update({
        where: { id: lesson.coachId },
        data: { coachElo: newElo },
      });
    });
  }
}

/**
 * Auto-detect no-shows for ACCEPTED/IN_PROGRESS lessons
 * where the scheduled time + 5 min buffer has passed.
 */
export async function detectNoShows() {
  const bufferCutoff = new Date(Date.now() - NO_SHOW_BUFFER_MS);

  // Find active lessons past their start time + buffer where someone hasn't joined
  const lessons = await prisma.lessonRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "IN_PROGRESS"] },
      scheduledStartAt: { not: null, lte: bufferCutoff },
      OR: [
        { coachJoinedAt: null },
        { studentJoinedAt: null },
      ],
    },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
  });

  for (const lesson of lessons) {
    if (!lesson.coachJoinedAt && !lesson.studentJoinedAt) {
      // Neither joined — expire, make student whole
      const txOps = [
        prisma.lessonRequest.update({
          where: { id: lesson.id },
          data: { status: "EXPIRED" },
        }),
        lesson.isTrial
          ? prisma.user.update({
              where: { id: lesson.studentId },
              data: { freeTrialsRemaining: { increment: 1 } },
            })
          : prisma.user.update({
              where: { id: lesson.studentId },
              data: { reservedBalance: { decrement: lesson.estimatedCost } },
            }),
        ...(lesson.timeSlotId
          ? [prisma.timeSlot.update({ where: { id: lesson.timeSlotId }, data: { status: "AVAILABLE" } })]
          : []),
      ];
      await prisma.$transaction(txOps);
    } else if (!lesson.coachJoinedAt) {
      // Coach didn't join — no-show
      await prisma.$transaction([
        prisma.lessonRequest.update({
          where: { id: lesson.id },
          data: { status: "NO_SHOW" },
        }),
        lesson.isTrial
          ? prisma.user.update({
              where: { id: lesson.studentId },
              data: { freeTrialsRemaining: { increment: 1 } },
            })
          : prisma.user.update({
              where: { id: lesson.studentId },
              data: { reservedBalance: { decrement: lesson.estimatedCost } },
            }),
        prisma.user.update({
          where: { id: lesson.coachId },
          data: { coachRatingPenalty: { increment: NO_SHOW_ELO_PENALTY } },
        }),
        ...(lesson.timeSlotId
          ? [prisma.timeSlot.update({ where: { id: lesson.timeSlotId }, data: { status: "AVAILABLE" } })]
          : []),
        prisma.abuseFlag.create({
          data: {
            userId: lesson.coachId,
            type: "COACH_NO_SHOW",
            severity: "HIGH",
            details: `Coach "${lesson.coach.username}" did not join scheduled lesson with student "${lesson.student.username}". Auto-detected by system. Student refunded.`,
            relatedLessonId: lesson.id,
            relatedUserId: lesson.studentId,
          },
        }),
      ]);

      const newElo = await calculateCoachElo(lesson.coachId);
      await prisma.user.update({
        where: { id: lesson.coachId },
        data: { coachElo: newElo },
      });
    } else if (!lesson.studentJoinedAt) {
      // Student didn't join — coach gets paid
      await prisma.$transaction([
        prisma.lessonRequest.update({
          where: { id: lesson.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            coachConfirmed: true,
            studentConfirmed: true,
          },
        }),
        ...(lesson.isTrial
          ? []
          : [
              prisma.user.update({
                where: { id: lesson.studentId },
                data: {
                  reservedBalance: { decrement: lesson.estimatedCost },
                },
              }),
              prisma.user.update({
                where: { id: lesson.coachId },
                data: {
                  pendingEarnings: { increment: lesson.estimatedCost },
                  totalEarningsAllTime: { increment: lesson.estimatedCost },
                  lessonsGiven: { increment: 1 },
                },
              }),
              prisma.transaction.create({
                data: {
                  userId: lesson.studentId,
                  type: "LESSON_PAYMENT",
                  amount: -lesson.estimatedCost,
                  lessonRequestId: lesson.id,
                },
              }),
              prisma.transaction.create({
                data: {
                  userId: lesson.coachId,
                  type: "LESSON_PAYMENT",
                  amount: lesson.estimatedCost,
                  lessonRequestId: lesson.id,
                },
              }),
              prisma.earningRecord.create({
                data: {
                  userId: lesson.coachId,
                  amount: lesson.estimatedCost,
                },
              }),
            ]),
        prisma.abuseFlag.create({
          data: {
            userId: lesson.studentId,
            type: "STUDENT_NO_SHOW",
            severity: "MEDIUM",
            details: `Student "${lesson.student.username}" did not join scheduled lesson with coach "${lesson.coach.username}". Auto-detected. Coach paid.`,
            relatedLessonId: lesson.id,
            relatedUserId: lesson.coachId,
          },
        }),
      ]);
    }
  }
}
