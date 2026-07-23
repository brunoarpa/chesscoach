import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Find an Online Chess Coach - Browse Coaches by Rating & Price",
  description:
    "Browse online chess coaches on EloChaser. Filter by rating, price, language, and availability to find the right coach for you, then message them free.",
  alternates: { canonical: "/search" },
};
import Link from "next/link";
import { CoachCard } from "@/components/coach-card";
import { SearchFilters } from "@/components/search-filters";
import { COACH_CATEGORIES } from "@/lib/coach-categories";
import { auth } from "@/lib/auth";
import { filterValidLanguages } from "@/lib/languages";
import { getEffectiveAvailability } from "@/lib/utils";
import { JsonLd } from "@/components/json-ld";
import { TrackEvent } from "@/components/analytics/track-event";
import { SITE_URL } from "@/lib/site";

interface SearchParams {
  q?: string;
  minRating?: string;
  maxRating?: string;
  minPrice?: string;
  maxPrice?: string;
  communication?: string;
  status?: string;
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

  if (params.minRating || params.maxRating) {
    where.chessRating = {};
    if (params.minRating) where.chessRating.gte = Number(params.minRating);
    if (params.maxRating) where.chessRating.lte = Number(params.maxRating);
  }

  if (params.minPrice || params.maxPrice) {
    const priceRange: { gte?: number; lte?: number } = {};
    if (params.minPrice) priceRange.gte = Math.round(Number(params.minPrice) * 100);
    if (params.maxPrice) priceRange.lte = Math.round(Number(params.maxPrice) * 100);
    // Match if either chat OR call price falls in the range - coaches setting
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


  // Booking-time filter: only surface coaches who have a bookable slot starting
  // within the requested window. availableFrom/availableTo are absolute (UTC) ISO
  // strings produced from the student's local wall-clock picks. Either bound is
  // optional ("any time before/after").
  if (params.availableFrom || params.availableTo) {
    const now = new Date();
    const from = params.availableFrom ? new Date(params.availableFrom) : null;
    const to = params.availableTo ? new Date(params.availableTo) : null;

    const startTime: { gte: Date; lt?: Date } = {
      // Never surface slots in the past - floor the lower bound at the current time.
      gte: from && !Number.isNaN(from.getTime()) && from.getTime() > now.getTime() ? from : now,
    };
    if (to && !Number.isNaN(to.getTime())) {
      startTime.lt = to;
    }

    where.timeSlots = {
      some: { status: "AVAILABLE", startTime },
    };
    // A coach who has paused bookings keeps their slots but must not surface in
    // time-based searches (mirrors the getEffectiveAvailability booking gate).
    where.coachAvailability = "AVAILABLE";
  }

  if (params.lastSeen && params.lastSeen !== "any") {
    const now = new Date();
    const thresholds: Record<string, number> = {
      online: 5 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const ms = thresholds[params.lastSeen];
    if (ms) {
      where.lastActiveAt = { gte: new Date(now.getTime() - ms) };
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

  // Review aggregates for just the 50 shown coaches, computed in the database
  // instead of shipping every review row to the app.
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

  // Surface coaches you can actually book first, keeping the ELO order the DB
  // returned within each group (stable sort). Non-bookable coaches still show
  // (for volume) but never bury a bookable one.
  const bookableById = new Map(
    coaches.map((c) => [
      c.id,
      getEffectiveAvailability(c.coachAvailability, c.coachChatPrice, c.coachCallPrice) === "AVAILABLE",
    ]),
  );
  const sortedCoaches = [...coaches].sort(
    (a, b) => Number(bookableById.get(b.id)) - Number(bookableById.get(a.id)),
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <TrackEvent event="coaches_browse" params={{ result_count: sortedCoaches.length }} />
      {/* Marks the page up as a coach listing. Only the unfiltered page is
          canonical, so this describes the default ranking rather than whatever
          filters happen to be applied. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": `${SITE_URL}/search#collection`,
          url: `${SITE_URL}/search`,
          name: "Find an Online Chess Coach",
          description:
            "Browse online chess coaches by rating, price, language and availability. One-on-one lessons on a live board, paid per 30-minute slot.",
          isPartOf: { "@id": `${SITE_URL}/#website` },
          mainEntity: {
            "@type": "ItemList",
            itemListOrder: "https://schema.org/ItemListOrderDescending",
            numberOfItems: sortedCoaches.length,
            itemListElement: sortedCoaches
              .filter((c) => c.username)
              .map((c, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${SITE_URL}/profile/${c.username}`,
                name: c.username,
              })),
          },
        }}
      />
      {/* This is the paid-search landing page as well as the browse page, so it
          has to sell before it filters: cold ad traffic arrives knowing nothing
          and used to land on a bare filter list. */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Find an Online Chess Coach</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Book one-on-one chess lessons with a coach in your rating range and budget.
        </p>
        {coaches.length === 0 && (
          <p className="text-sm text-muted-foreground mt-3">
            No coaches match your filters yet.
          </p>
        )}
        {/* Product promises rather than marketplace stats, so they stay true at
            any size and cost no query on a page that already runs several. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          {[
            { label: "Free", sub: "first lessons" },
            { label: "Live board", sub: "synced in every lesson" },
            { label: "/ 30 min", sub: "pay per slot, no subscription" },
            { label: "Message free", sub: "before you book" },
          ].map((s) => (
            <div key={s.sub} className="rounded-lg border p-3 text-center">
              <div className="font-bold tracking-tight">{s.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {COACH_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/coaches/${c.slug}`}
              className="rounded-full border px-3 py-1 text-sm hover:bg-muted transition-colors"
            >
              {c.h1}
            </Link>
          ))}
        </div>
      </div>

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
              {sortedCoaches.map((coach) => {
                const reviews = reviewsById.get(coach.id);
                const bookable = bookableById.get(coach.id) ?? false;
                return (
                  <CoachCard
                    key={coach.id}
                    id={coach.id}
                    username={coach.username ?? "unknown"}
                    image={coach.image}
                    chessRating={coach.chessRating}
                    coachChatPrice={coach.coachChatPrice}
                    coachCallPrice={coach.coachCallPrice}
                    communicationPreference={coach.communicationPreference}
                    activityStatus={coach.activityStatus}
                    coachAvailability={coach.coachAvailability}
                    bookable={bookable}
                    hasOpenSlots={coach._count.timeSlots > 0}
                    acceptingFreeTrials={coach.acceptingFreeTrials}
                    lastActiveAt={coach.lastActiveAt}
                    avgRating={reviews?.avg ?? null}
                    reviewCount={reviews?.count ?? 0}
                    lessonsGiven={coach.lessonsGiven}
                    bio={coach.bio}
                    languages={coach.languages}
                    isFavourited={favouriteCoachIds.includes(coach.id)}
                    showFavourite={!!session?.user}
                    isLoggedIn={!!session?.user}
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
