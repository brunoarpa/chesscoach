import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { CoachCard } from "@/components/coach-card";
import { JsonLd } from "@/components/json-ld";
import { SITE_URL } from "@/lib/site";
import { COACH_WHERE, getCoachListing } from "@/lib/coach-listing";
import { COACH_CATEGORIES, getCoachCategory } from "@/lib/coach-categories";

export function generateStaticParams() {
  return COACH_CATEGORIES.map((c) => ({ category: c.slug }));
}

// Coach set changes as coaches join / adjust prices; rebuild at most daily.
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getCoachCategory(slug);
  if (!category) return { title: "Coaches" };

  // Keep near-empty categories out of the index so we never publish a thin page.
  const count = await prisma.user.count({
    where: { AND: [COACH_WHERE, category.filter] },
  });

  return {
    // Absolute: the title already ends with "| EloChaser", so opt out of the
    // layout's "%s | EloChaser" template to avoid doubling the brand.
    title: { absolute: category.title },
    description: category.description,
    alternates: { canonical: `/coaches/${category.slug}` },
    openGraph: {
      title: category.title,
      description: category.description,
      url: `${SITE_URL}/coaches/${category.slug}`,
    },
    robots: { index: count > 0, follow: true },
  };
}

export default async function CoachCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = getCoachCategory(slug);
  if (!category) notFound();

  const session = await auth();

  let favouriteCoachIds: string[] = [];
  if (session?.user?.id) {
    const favs = await prisma.favourite.findMany({
      where: { userId: session.user.id },
      select: { coachId: true },
    });
    favouriteCoachIds = favs.map((f) => f.coachId);
  }

  const { coaches, reviewsById, bookableById } = await getCoachListing({
    AND: [COACH_WHERE, category.filter],
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Find a coach", item: `${SITE_URL}/search` },
            {
              "@type": "ListItem",
              position: 2,
              name: category.h1,
              item: `${SITE_URL}/coaches/${category.slug}`,
            },
          ],
        }}
      />

      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/search" className="hover:text-foreground">
          Find a coach
        </Link>{" "}
        / <span className="text-foreground">{category.h1}</span>
      </nav>

      <h1 className="text-3xl font-bold">{category.h1}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
        {category.intro}
      </p>

      {/* Sibling categories: internal links + discovery. */}
      <div className="mt-5 flex flex-wrap gap-2">
        {COACH_CATEGORIES.filter((c) => c.slug !== category.slug).map((c) => (
          <Link
            key={c.slug}
            href={`/coaches/${c.slug}`}
            className="rounded-full border px-3 py-1 text-sm hover:bg-muted transition-colors"
          >
            {c.h1}
          </Link>
        ))}
        <Link
          href="/search"
          className="rounded-full border px-3 py-1 text-sm hover:bg-muted transition-colors"
        >
          Browse all coaches
        </Link>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        {coaches.length === 0
          ? "No coaches in this category yet."
          : `${coaches.length} coach${coaches.length === 1 ? "" : "es"}`}
      </p>

      {coaches.length === 0 ? (
        <p className="text-muted-foreground py-8">
          No coaches match this category right now.{" "}
          <Link href="/search" className="text-primary underline underline-offset-2">
            Browse all chess coaches
          </Link>
          .
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coaches.map((coach) => {
            const reviews = reviewsById.get(coach.id);
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
                bookable={bookableById.get(coach.id) ?? false}
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
  );
}
