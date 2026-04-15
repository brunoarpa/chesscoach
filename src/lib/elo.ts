import { prisma } from "@/lib/prisma";

const BASE_RATING = 100;
const ACTIVITY_BONUS = 500; // bonus for being active on the site (decays from lastActiveAt)
const ACTIVITY_DECAY = 0.1; // half-life ≈ 7 days — drops fast without logins
const EARNING_BONUS = 400; // bonus from recent earnings (decays from last earning date)
const EARNING_DECAY = 0.023; // half-life ≈ 30 days
const EARNINGS_MULTIPLIER = 100; // log-scaled lifetime earnings boost

/**
 * Calculate coach ELO rating.
 *
 * Formula: 100 + 500·e^(-0.1·daysSinceActive) + 400·e^(-0.023·daysSinceLastEarning) + 100·ln(1 + totalEarnings$)
 *
 * - New active coach starts at ~1000.
 * - Activity component (500 pts) decays with ~7-day half-life — log in regularly to stay high.
 * - Earning component (400 pts) decays with ~30-day half-life from last earning.
 * - Log-scaled lifetime earnings give a permanent (but diminishing) boost.
 * - Floor at 100 for completely inactive coaches.
 */
export async function calculateCoachElo(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, lastActiveAt: true },
  });

  if (!user) return BASE_RATING + ACTIVITY_BONUS + EARNING_BONUS;

  const earnings = await prisma.earningRecord.findMany({
    where: { userId },
    select: { amount: true, earnedAt: true },
    orderBy: { earnedAt: "desc" },
  });

  const now = new Date();

  // Days since last site activity (login, dashboard visit, etc.)
  const daysSinceActive =
    (now.getTime() - user.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);

  // Days since last earning (or account creation if never earned)
  const lastEarning =
    earnings.length > 0 ? earnings[0].earnedAt : user.createdAt;
  const daysSinceEarning =
    (now.getTime() - lastEarning.getTime()) / (1000 * 60 * 60 * 24);

  // Total lifetime earnings in dollars
  const totalDollars =
    earnings.reduce((sum, e) => sum + e.amount, 0) / 100;

  const activityFactor = Math.exp(-ACTIVITY_DECAY * daysSinceActive);
  const earningDecayFactor = Math.exp(-EARNING_DECAY * daysSinceEarning);
  const earningsBoost = EARNINGS_MULTIPLIER * Math.log(1 + totalDollars);

  return Math.round(
    BASE_RATING +
    ACTIVITY_BONUS * activityFactor +
    EARNING_BONUS * earningDecayFactor +
    earningsBoost
  );
}

/**
 * Recalculate ELO for all verified coaches (called by cron)
 */
export async function recalculateAllElos() {
  const coaches = await prisma.user.findMany({
    where: {
      verificationStatus: "VERIFIED",
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
