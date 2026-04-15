import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CoachCard } from "@/components/coach-card";
import { SearchFilters } from "@/components/search-filters";
import { auth } from "@/lib/auth";

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
  lastSeen?: string;
  favourites?: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await auth();

  // Build where clause
  const where: Prisma.UserWhereInput = {
    verificationStatus: "VERIFIED",
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
    where.coachPricePer5Min = {};
    if (params.minPrice)
      where.coachPricePer5Min.gte = Math.round(Number(params.minPrice) * 100);
    if (params.maxPrice)
      where.coachPricePer5Min.lte = Math.round(Number(params.maxPrice) * 100);
  }

  if (params.communication && params.communication !== "any") {
    where.communicationPreference = params.communication as "CHAT_ONLY" | "CHAT_AND_CALL";
  }

  if (params.status) {
    where.activityStatus = params.status as "ACTIVE" | "AWAY" | "INACTIVE";
  }

  if (params.availability && params.availability !== "all") {
    where.coachAvailability = params.availability as "AVAILABLE" | "BUSY" | "UNAVAILABLE";
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
      coachPricePer5Min: true,
      gameReviewPricePer5Min: true,
      communicationPreference: true,
      coachElo: true,
      activityStatus: true,
      coachAvailability: true,
      lastActiveAt: true,
      lessonsGiven: true,
      bio: true,
      reviewsReceived: { select: { rating: true } },
    },
  });

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
                const avgRating =
                  coach.reviewsReceived.length > 0
                    ? coach.reviewsReceived.reduce((s: number, r: { rating: number }) => s + r.rating, 0) /
                      coach.reviewsReceived.length
                    : null;
                return (
                  <CoachCard
                    key={coach.id}
                    id={coach.id}
                    username={coach.username}
                    chessRating={coach.chessRating}
                    continent={coach.continent}
                    coachPricePer5Min={coach.coachPricePer5Min}
                    gameReviewPricePer5Min={coach.gameReviewPricePer5Min}
                    communicationPreference={coach.communicationPreference}
                    coachElo={coach.coachElo}
                    activityStatus={coach.activityStatus}
                    coachAvailability={coach.coachAvailability}
                    lastActiveAt={coach.lastActiveAt}
                    avgRating={avgRating}
                    reviewCount={coach.reviewsReceived.length}
                    lessonsGiven={coach.lessonsGiven}
                    bio={coach.bio}
                    isFavourited={favouriteCoachIds.includes(coach.id)}
                    showFavourite={!!session?.user}
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
