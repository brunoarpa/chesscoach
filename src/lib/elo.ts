import { prisma } from "@/lib/prisma";

const BASE_RATING = 100;
const INITIAL_BONUS = 900; // so new coaches start at 1000
const DECAY_RATE = 0.005; // half-life ≈ 139 days
const EARNINGS_MULTIPLIER = 150;

/**
 * Calculate coach ELO rating.
 *
 * Formula: 100 + 900·e^(-0.005·daysSinceActivity) + 150·ln(1 + totalEarnings$)
 *
 * - Starts at 1000 for new coaches.
 * - Decays asymptotically towards 100 without activity (slow, ~139-day half-life).
 * - Earnings boost the rating via log so dollar amounts stay private.
 */
export async function calculateCoachElo(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });

  if (!user) return BASE_RATING + INITIAL_BONUS;

  const earnings = await prisma.earningRecord.findMany({
    where: { userId },
    select: { amount: true, earnedAt: true },
    orderBy: { earnedAt: "desc" },
  });

  const now = new Date();

  // Days since last activity: last earning, or account creation if never earned
  const lastActivity =
    earnings.length > 0 ? earnings[0].earnedAt : user.createdAt;
  const daysSinceActivity =
    (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

  // Total lifetime earnings in dollars
  const totalDollars =
    earnings.reduce((sum, e) => sum + e.amount, 0) / 100;

  const decayFactor = Math.exp(-DECAY_RATE * daysSinceActivity);
  const earningsBoost = EARNINGS_MULTIPLIER * Math.log(1 + totalDollars);

  return Math.round(BASE_RATING + INITIAL_BONUS * decayFactor + earningsBoost);
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
