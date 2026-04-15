import { prisma } from "@/lib/prisma";

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

  // Auto-set coaches to UNAVAILABLE if inactive for 24+ hours
  await prisma.user.updateMany({
    where: {
      lastActiveAt: { lt: oneDayAgo },
      verificationStatus: "VERIFIED",
      coachAvailability: { not: "UNAVAILABLE" },
    },
    data: { coachAvailability: "UNAVAILABLE" },
  });
}

/**
 * Expire pending lesson requests older than 3 days
 */
export async function expirePendingRequests() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const expiredRequests = await prisma.lessonRequest.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: threeDaysAgo },
    },
  });

  for (const request of expiredRequests) {
    const txOps = [
      prisma.lessonRequest.update({
        where: { id: request.id },
        data: { status: "EXPIRED" },
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
          ? [
              prisma.user.update({
                where: { id: lesson.studentId },
                data: { lessonsTaken: { increment: 1 } },
              }),
              prisma.user.update({
                where: { id: lesson.coachId },
                data: { lessonsGiven: { increment: 1 } },
              }),
            ]
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
