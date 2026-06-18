import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CoachCard } from "@/components/coach-card";
import { SearchFilters } from "@/components/search-filters";
import { auth } from "@/lib/auth";
import { filterValidLanguages } from "@/lib/languages";

interface SearchParams {
  q?: string;
  continent?: string;
  minRating?: string;
  maxRating?: string;
  minPrice?: string;
  maxPrice?: string;
  communication?: string;
  status?: string;
  availability?: string;
  availableFrom?: string;
  availableTo?: string;
  lastSeen?: string;
  favourites?: string;
  languages?: string | string[];
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await auth();

  // Coaches are anyone with a chat or call price set. chess.com verification is optional.
  const where: Prisma.UserWhereInput = {
    isSuspended: false,
    OR: [
      { coachChatPrice: { not: null } },
      { coachCallPrice: { not: null } },
    ],
  };

  // Favourites filter
  let favouriteCoachIds: string[] = [];
  if (session?.user?.id) {
    const favs = await prisma.favourite.findMany({
      where: { userId: session.user.id },
      select: { coachId: true },
    });
    favouriteCoachIds = favs.map((f) => f.coachId);
  }
  if (params.favourites === "true" && favouriteCoachIds.length > 0) {
    where.id = { in: favouriteCoachIds };
  }

  if (params.q) {
    where.username = { contains: params.q, mode: "insensitive" };
  }

  if (params.continent && params.continent !== "all") {
    where.continent = params.continent as "AFRICA" | "ASIA" | "EUROPE" | "NORTH_AMERICA" | "SOUTH_AMERICA" | "OCEANIA";
  }

  if (params.minRating || params.maxRating) {
    where.chessRating = {};
    if (params.minRating) where.chessRating.gte = Number(params.minRating);
    if (params.maxRating) where.chessRating.lte = Number(params.maxRating);
  }

  if (params.minPrice || params.maxPrice) {
    const priceRange: { gte?: number; lte?: number } = {};
    if (params.minPrice) priceRange.gte = Math.round(Number(params.minPrice) * 100);
    if (params.maxPrice) priceRange.lte = Math.round(Number(params.maxPrice) * 100);
    // Match if either chat OR call price falls in the range — coaches setting
    // only one of the two prices should still surface.
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { coachChatPrice: priceRange },
          { coachCallPrice: priceRange },
        ],
      },
    ];
  }

  if (params.communication && params.communication !== "any") {
    where.communicationPreference = params.communication as "CHAT_ONLY" | "CHAT_AND_CALL";
  }

  if (params.status) {
    where.activityStatus = params.status as "ACTIVE" | "AWAY" | "INACTIVE";
  }

  if (params.availability && params.availability !== "all") {
    // Bookability is purely the coach's manual toggle now — presence no longer
    // gates it (see getEffectiveAvailability). A coach with no price is treated
    // as Unavailable, matching the helper.
    where.coachAvailability =
      params.availability === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE";
  }

  // Booking-time filter: only surface coaches who have a bookable slot starting
  // within the requested window. availableFrom/availableTo are absolute (UTC) ISO
  // strings produced from the student's local wall-clock picks. Either bound is
  // optional ("any time before/after").
  if (params.availableFrom || params.availableTo) {
    const now = new Date();
    const from = params.availableFrom ? new Date(params.availableFrom) : null;
    const to = params.availableTo ? new Date(params.availableTo) : null;

    const startTime: { gte: Date; lt?: Date } = {
      // Never surface slots in the past — floor the lower bound at the current time.
      gte: from && !Number.isNaN(from.getTime()) && from.getTime() > now.getTime() ? from : now,
    };
    if (to && !Number.isNaN(to.getTime())) {
      startTime.lt = to;
    }

    where.timeSlots = {
      some: { status: "AVAILABLE", startTime },
    };
  }

  if (params.lastSeen && params.lastSeen !== "any") {
     
    const now = Date.now();
    const thresholds: Record<string, number> = {
      online: 5 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const ms = thresholds[params.lastSeen];
    if (ms) {
      where.lastActiveAt = { gte: new Date(now - ms) };
    }
  }

  const rawLanguages = Array.isArray(params.languages)
    ? params.languages
    : params.languages
      ? [params.languages]
      : [];
  const languages = filterValidLanguages(rawLanguages);
  if (languages.length > 0) {
    where.languages = { hasSome: languages };
  }

  // Sort by Coach ELO so stronger coaches surface first
  type OrderBy = Prisma.UserOrderByWithRelationInput;
  const orderBy: OrderBy[] = [
    { coachElo: "desc" },
  ];

  const coaches = await prisma.user.findMany({
    where,
    orderBy,
    take: 50,
    select: {
      id: true,
      username: true,
      chessRating: true,
      continent: true,
      coachChatPrice: true,
      coachCallPrice: true,
      communicationPreference: true,
      coachElo: true,
      activityStatus: true,
      coachAvailability: true,
      lastActiveAt: true,
      lessonsGiven: true,
      bio: true,
      languages: true,
    },
  });

  const coachIds = coaches.map((c) => c.id);

  // Global leaderboard ranks (ties share a rank, like the leaderboard page) and
  // review aggregates — both computed in the database for just the 50 shown
  // coaches, instead of shipping every coach row / review row to the app.
  const [rankRows, reviewStats] = coachIds.length
    ? await Promise.all([
        prisma.$queryRaw<{ id: string; rank: bigint }[]>`
          SELECT id, rank FROM (
            SELECT id, RANK() OVER (ORDER BY "coachElo" DESC) AS rank
            FROM "User"
            WHERE "isSuspended" = false
              AND ("coachChatPrice" IS NOT NULL OR "coachCallPrice" IS NOT NULL)
          ) ranked
          WHERE id IN (${Prisma.join(coachIds)})
        `,
        prisma.review.groupBy({
          by: ["toUserId"],
          where: { toUserId: { in: coachIds } },
          _avg: { rating: true },
          _count: { rating: true },
        }),
      ])
    : [[], []];

  const rankById = new Map(rankRows.map((r) => [r.id, Number(r.rank)]));
  const reviewsById = new Map(
    reviewStats.map((r) => [r.toUserId, { avg: r._avg.rating, count: r._count.rating }]),
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">Find a Coach</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <aside>
          <SearchFilters params={params as Record<string, string | undefined>} isLoggedIn={!!session?.user} />
        </aside>

        <div className="md:col-span-3">
          {coaches.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              No coaches found matching your filters.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {coaches.map((coach) => {
                const reviews = reviewsById.get(coach.id);
                return (
                  <CoachCard
                    key={coach.id}
                    id={coach.id}
                    username={coach.username ?? "unknown"}
                    chessRating={coach.chessRating}
                    continent={coach.continent}
                    coachChatPrice={coach.coachChatPrice}
                    coachCallPrice={coach.coachCallPrice}
                    communicationPreference={coach.communicationPreference}
                    coachElo={coach.coachElo}
                    activityStatus={coach.activityStatus}
                    coachAvailability={coach.coachAvailability}
                    lastActiveAt={coach.lastActiveAt}
                    avgRating={reviews?.avg ?? null}
                    reviewCount={reviews?.count ?? 0}
                    lessonsGiven={coach.lessonsGiven}
                    bio={coach.bio}
                    languages={coach.languages}
                    isFavourited={favouriteCoachIds.includes(coach.id)}
                    showFavourite={!!session?.user}
                    rank={rankById.get(coach.id) ?? 0}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
