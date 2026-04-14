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
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: request.id },
        data: { status: "EXPIRED" },
      }),
      prisma.user.update({
        where: { id: request.studentId },
        data: { reservedBalance: { decrement: request.estimatedCost } },
      }),
    ]);
  }
}
