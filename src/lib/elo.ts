import { prisma } from "@/lib/prisma";

const BASE_RATING = 100;
const ACTIVITY_BONUS = 500; // bonus for being active on the site (decays from lastActiveAt)
const ACTIVITY_DECAY = 0.1; // half-life ≈ 7 days — drops fast without logins
const EARNING_BONUS = 400; // bonus from recent earnings (decays from last earning date)
const EARNING_DECAY = 0.023; // half-life ≈ 30 days
const EARNINGS_MULTIPLIER = 100; // log-scaled lifetime earnings boost

type PrismaLike = Pick<typeof prisma, "user" | "earningRecord">;

/**
 * Calculate coach ELO rating.
 *
 * Formula: 100 + 500·e^(-0.1·daysSinceActive) + 400·e^(-0.023·daysSinceLastEarning) + 100·ln(1 + totalEarnings€)
 *
 * Accepts an optional prisma client (e.g. a transaction client) so it can
 * read data that hasn't been committed yet.
 */
export async function calculateCoachElo(userId: string, db: PrismaLike = prisma): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, lastActiveAt: true, coachRatingPenalty: true },
  });

  if (!user) return BASE_RATING + ACTIVITY_BONUS + EARNING_BONUS;

  const earnings = await db.earningRecord.findMany({
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

  const penalty = user.coachRatingPenalty ?? 0;

  return Math.max(0, Math.round(
    BASE_RATING +
    ACTIVITY_BONUS * activityFactor +
    EARNING_BONUS * earningDecayFactor +
    earningsBoost -
    penalty
  ));
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
