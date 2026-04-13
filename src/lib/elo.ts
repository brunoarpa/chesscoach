import { prisma } from "@/lib/prisma";

/**
 * Calculate coach ELO based on earnings with time decay.
 * Last 30 days: 100% weight
 * 30-90 days: 50% weight
 * 90+ days: 25% weight
 */
export async function calculateCoachElo(userId: string): Promise<number> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const earnings = await prisma.earningRecord.findMany({
    where: { userId },
    select: { amount: true, earnedAt: true },
  });

  let weightedTotal = 0;
  for (const record of earnings) {
    if (record.earnedAt >= thirtyDaysAgo) {
      weightedTotal += record.amount; // 100%
    } else if (record.earnedAt >= ninetyDaysAgo) {
      weightedTotal += record.amount * 0.5; // 50%
    } else {
      weightedTotal += record.amount * 0.25; // 25%
    }
  }

  // Convert cents to a meaningful ELO-like score
  // Every $100 earned (weighted) = ~100 ELO points
  return Math.round(weightedTotal / 100);
}

/**
 * Recalculate ELO for all coaches (called by cron)
 */
export async function recalculateAllElos() {
  const coaches = await prisma.user.findMany({
    where: {
      totalEarningsAllTime: { gt: 0 },
    },
    select: { id: true },
  });

  for (const coach of coaches) {
    const elo = await calculateCoachElo(coach.id);
    await prisma.user.update({
      where: { id: coach.id },
      data: { coachElo: elo },
    });
  }
}
