import { prisma } from "@/lib/prisma";
import { hadFairResponseWindow } from "@/lib/utils";

// Rating weights. The score rewards *behaviour*, not presence: quality (reviews)
// and volume (completed lessons) are how a coach climbs and overtakes others;
// responsiveness and the absence of no-shows set the ceiling; recency is only a
// small nudge. See the formula in calculateCoachElo for how they combine.
const BASE = 100;

// Small recency nudge. Being around helps a little, but never dominates - this
// is a fraction of what reviews/responsiveness are worth (it used to be 500).
const ACTIVITY_BONUS = 150;
const ACTIVITY_DECAY = 0.1; // half-life ~7 days

// Review quality - the central signal. Shrunk toward a neutral-good prior so a
// brand-new coach with no reviews isn't buried, and one bad early review
// doesn't tank them.
const REVIEW_WEIGHT = 600;
const REVIEW_PRIOR_MEAN = 4; // out of 5
const REVIEW_PRIOR_COUNT = 3;

// Responsiveness: share of requests answered (accept OR decline) vs ghosted
// (left to expire) over the trailing window, shrunk toward an optimistic prior.
const RESP_WEIGHT = 400;
const RESP_PRIOR_RATE = 0.9;
const RESP_PRIOR_COUNT = 3;

// Small bonus for answering fast.
const SPEED_BONUS = 80;
const FAST_RESPONSE_MS = 60 * 60 * 1000; // <=1h median -> full bonus
const SLOW_RESPONSE_MS = 24 * 60 * 60 * 1000; // >=24h median -> none
const NEUTRAL_SPEED_FACTOR = 0.7; // when there's no response history yet

// Experience: log-scaled completed lessons. Gives lasting headroom to climb.
const VOLUME_MULT = 150;

// Penalties, lightest to heaviest: declining (near-zero, rate-based) < ghosting
// < no-shows (the existing accumulated coachRatingPenalty). Ghosting is also
// reflected in responsiveness; this is the extra absolute deterrent.
const DECLINE_RATE_PENALTY = 60; // applied to declineRate (0..1), so at most this
const GHOST_PENALTY = 50; // per fairly-ghosted request in the window

const RATING_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

type PrismaLike = Pick<typeof prisma, "user" | "review" | "lessonRequest">;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Calculate a coach's rating from their behaviour.
 *
 * score = BASE
 *       + ACTIVITY_BONUS · e^(-decay·daysSinceActive)        (small recency nudge)
 *       + REVIEW_WEIGHT  · reviewQuality                       (avg stars, prior-shrunk)
 *       + RESP_WEIGHT    · responsiveness                      (answered / answered+ghosted)
 *       + SPEED_BONUS    · speedFactor                         (median response time)
 *       + VOLUME_MULT    · ln(1 + completedLessons)            (experience)
 *       − GHOST_PENALTY  · ghostedCount                        (ignored requests)
 *       − DECLINE_RATE_PENALTY · declineRate                   (near-zero)
 *       − coachRatingPenalty                                   (no-shows)
 *
 * Accepts an optional prisma client (e.g. a transaction client) so it can read
 * data that hasn't been committed yet.
 */
export async function calculateCoachElo(userId: string, db: PrismaLike = prisma): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { lastActiveAt: true, coachRatingPenalty: true },
  });
  if (!user) return BASE + ACTIVITY_BONUS;

  const now = Date.now();
  const windowStart = new Date(now - RATING_WINDOW_MS);

  // Reviews (all-time): average rating, shrunk toward a neutral-good prior.
  const reviews = await db.review.findMany({
    where: { toUserId: userId },
    select: { rating: true },
  });
  const reviewSum = reviews.reduce((s, r) => s + r.rating, 0);
  const effectiveAvg =
    (reviewSum + REVIEW_PRIOR_MEAN * REVIEW_PRIOR_COUNT) / (reviews.length + REVIEW_PRIOR_COUNT);
  const reviewQuality = Math.min(1, Math.max(0, (effectiveAvg - 1) / 4));

  // Request behaviour over the trailing window.
  const requests = await db.lessonRequest.findMany({
    where: { coachId: userId, createdAt: { gte: windowStart } },
    select: { status: true, createdAt: true, respondedAt: true, acceptanceDeadline: true },
  });

  let answered = 0;
  let ghosted = 0;
  let declined = 0;
  const responseTimes: number[] = [];
  for (const r of requests) {
    if (r.respondedAt) {
      answered++;
      responseTimes.push(r.respondedAt.getTime() - r.createdAt.getTime());
      if (r.status === "DECLINED") declined++;
    } else if (r.status === "EXPIRED" && hadFairResponseWindow(r.createdAt, r.acceptanceDeadline)) {
      // Only count it against the coach if they actually had time to respond -
      // a near-instant booking that lapsed isn't their fault.
      ghosted++;
    }
  }

  const responsiveness =
    (answered + RESP_PRIOR_RATE * RESP_PRIOR_COUNT) / (answered + ghosted + RESP_PRIOR_COUNT);
  const declineRate = answered > 0 ? declined / answered : 0;

  let speedFactor = NEUTRAL_SPEED_FACTOR;
  if (responseTimes.length > 0) {
    const med = median(responseTimes);
    if (med <= FAST_RESPONSE_MS) speedFactor = 1;
    else if (med >= SLOW_RESPONSE_MS) speedFactor = 0;
    else speedFactor = 1 - (med - FAST_RESPONSE_MS) / (SLOW_RESPONSE_MS - FAST_RESPONSE_MS);
  }

  const completedLessons = await db.lessonRequest.count({
    where: { coachId: userId, status: "COMPLETED" },
  });

  const daysSinceActive = (now - user.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);
  const penalty = user.coachRatingPenalty ?? 0;

  const score =
    BASE +
    ACTIVITY_BONUS * Math.exp(-ACTIVITY_DECAY * daysSinceActive) +
    REVIEW_WEIGHT * reviewQuality +
    RESP_WEIGHT * responsiveness +
    SPEED_BONUS * speedFactor +
    VOLUME_MULT * Math.log(1 + completedLessons) -
    GHOST_PENALTY * ghosted -
    DECLINE_RATE_PENALTY * declineRate -
    penalty;

  return Math.max(0, Math.round(score));
}

/**
 * Recalculate ELO for all coaches (called by cron).
 * Coach = anyone with a chat or call price; chess.com verification is optional.
 */
export async function recalculateAllElos() {
  const coaches = await prisma.user.findMany({
    where: {
      OR: [
        { coachChatPrice: { not: null } },
        { coachCallPrice: { not: null } },
      ],
    },
    select: { id: true },
  });

  // Process in bounded-concurrency chunks. Each calculateCoachElo runs several
  // queries, so a flat sequential loop is needlessly slow at scale while an
  // unbounded Promise.all would swamp the connection pool. 10 at a time is a
  // safe middle ground for the daily cron.
  const CONCURRENCY = 10;
  for (let i = 0; i < coaches.length; i += CONCURRENCY) {
    const chunk = coaches.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (coach) => {
        const elo = await calculateCoachElo(coach.id);
        await prisma.user.update({
          where: { id: coach.id },
          data: { coachElo: elo },
        });
      }),
    );
  }
}
