import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getEffectiveAvailability } from "@/lib/utils";

// Base definition of "a coach": not suspended, with at least one lesson price.
// Category pages AND this with their own extra filter.
export const COACH_WHERE: Prisma.UserWhereInput = {
  isSuspended: false,
  OR: [{ coachChatPrice: { not: null } }, { coachCallPrice: { not: null } }],
};

/**
 * Fetch a coach listing for the search page and category landing pages: the
 * same query, review aggregates, and "bookable coaches first" ordering, in one
 * place so the two surfaces can never drift apart.
 */
export async function getCoachListing(where: Prisma.UserWhereInput) {
  const coaches = await prisma.user.findMany({
    where,
    orderBy: [{ coachElo: "desc" }],
    take: 50,
    select: {
      id: true,
      username: true,
      image: true,
      chessRating: true,
      coachChatPrice: true,
      coachCallPrice: true,
      communicationPreference: true,
      activityStatus: true,
      coachAvailability: true,
      acceptingFreeTrials: true,
      lastActiveAt: true,
      lessonsGiven: true,
      bio: true,
      languages: true,
      _count: {
        select: {
          timeSlots: { where: { status: "AVAILABLE", startTime: { gte: new Date() } } },
        },
      },
    },
  });

  const coachIds = coaches.map((c) => c.id);
  const reviewStats = coachIds.length
    ? await prisma.review.groupBy({
        by: ["toUserId"],
        where: { toUserId: { in: coachIds } },
        _avg: { rating: true },
        _count: { rating: true },
      })
    : [];

  const reviewsById = new Map(
    reviewStats.map((r) => [r.toUserId, { avg: r._avg.rating, count: r._count.rating }]),
  );

  const bookableById = new Map(
    coaches.map((c) => [
      c.id,
      getEffectiveAvailability(c.coachAvailability, c.coachChatPrice, c.coachCallPrice) === "AVAILABLE",
    ]),
  );

  // Bookable coaches first, stable within the DB's ELO order.
  const sorted = [...coaches].sort(
    (a, b) => Number(bookableById.get(b.id)) - Number(bookableById.get(a.id)),
  );

  return { coaches: sorted, reviewsById, bookableById };
}
