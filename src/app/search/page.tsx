import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CoachCard } from "@/components/coach-card";
import { SearchFilters } from "@/components/search-filters";

interface SearchParams {
  q?: string;
  continent?: string;
  minRating?: string;
  maxRating?: string;
  minPrice?: string;
  maxPrice?: string;
  communication?: string;
  status?: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Build where clause
  const where: Prisma.UserWhereInput = {
    verificationStatus: "VERIFIED",
    coachingEnabled: true,
  };

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
    where.coachPricePerHour = {};
    if (params.minPrice)
      where.coachPricePerHour.gte = Math.round(Number(params.minPrice) * 100);
    if (params.maxPrice)
      where.coachPricePerHour.lte = Math.round(Number(params.maxPrice) * 100);
  }

  if (params.communication && params.communication !== "any") {
    where.communicationPreference = params.communication as "CHAT_ONLY" | "CHAT_AND_CALL";
  }

  if (params.status) {
    where.activityStatus = params.status as "ACTIVE" | "AWAY" | "INACTIVE";
  }

  // Build order by — always by total earnings
  type OrderBy = Prisma.UserOrderByWithRelationInput;
  const orderBy: OrderBy[] = [
    { totalEarningsAllTime: "desc" },
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
      coachPricePerHour: true,
      gameReviewPrice: true,
      communicationPreference: true,
      coachElo: true,
      activityStatus: true,
      coachingEnabled: true,
      lastActiveAt: true,
      lessonsGiven: true,
      reviewsReceived: { select: { rating: true } },
    },
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">Find a Coach</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <aside>
          <SearchFilters params={params as Record<string, string | undefined>} />
        </aside>

        <div className="md:col-span-3">
          {coaches.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              No coaches found matching your filters.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {coaches.map((coach) => {
                const avgRating =
                  coach.reviewsReceived.length > 0
                    ? coach.reviewsReceived.reduce((s: number, r: { rating: number }) => s + r.rating, 0) /
                      coach.reviewsReceived.length
                    : null;
                return (
                  <CoachCard
                    key={coach.id}
                    username={coach.username}
                    chessRating={coach.chessRating}
                    continent={coach.continent}
                    coachPricePerHour={coach.coachPricePerHour}
                    gameReviewPrice={coach.gameReviewPrice}
                    communicationPreference={coach.communicationPreference}
                    coachElo={coach.coachElo}
                    activityStatus={coach.activityStatus}
                    coachingEnabled={coach.coachingEnabled}
                    avgRating={avgRating}
                    reviewCount={coach.reviewsReceived.length}
                    lessonsGiven={coach.lessonsGiven}
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
