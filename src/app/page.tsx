import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MessagesSquare, MonitorPlay, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveAvailability } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";

// A coach is anyone with a lesson price set. Reused for every landing query so
// the counts, ELO range, and sample strip all describe the same population.
const COACH_WHERE: Prisma.UserWhereInput = {
  isSuspended: false,
  OR: [{ coachChatPrice: { not: null } }, { coachCallPrice: { not: null } }],
};

export const metadata: Metadata = {
  // Absolute: opt out of the "%s | EloChaser" template so the brand isn't doubled.
  title: {
    absolute: "Online Chess Coaching - Find Your Chess Coach | EloChaser",
  },
  description:
    "One-on-one chess lessons on a live, synced board. Find an online chess coach in your rating range and budget, message them free, and get your first lessons free.",
  alternates: { canonical: "/" },
};

function startingPrice(chat: number | null, call: number | null): number | null {
  const prices = [chat, call].filter((p): p is number => p != null);
  return prices.length ? Math.min(...prices) : null;
}

export default async function Home() {
  const session = await auth();

  // Logged-out visitors see the standing offer. Logged-in students see their
  // real remaining trials, so the hook never lies once the trials are spent.
  let trialsRemaining = 3;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { freeTrialsRemaining: true },
    });
    trialsRemaining = user?.freeTrialsRemaining ?? 0;
  }
  const hasTrials = trialsRemaining > 0;

  const [eloAgg, lessonsAgg, sampleCoaches] = await Promise.all([
    prisma.user.aggregate({
      where: { ...COACH_WHERE, chessRating: { not: null } },
      _min: { chessRating: true },
      _max: { chessRating: true },
    }),
    prisma.user.aggregate({ where: COACH_WHERE, _sum: { lessonsGiven: true } }),
    prisma.user.findMany({
      where: COACH_WHERE,
      // Same order as the search page: top by coaching rating (coachElo). We
      // pull a few extra so we can float bookable coaches first, then take 4,
      // mirroring exactly what shows at the top of "Find a Coach".
      orderBy: { coachElo: "desc" },
      take: 12,
      select: {
        id: true,
        username: true,
        image: true,
        chessRating: true,
        coachChatPrice: true,
        coachCallPrice: true,
        coachAvailability: true,
      },
    }),
  ]);

  // Bookable coaches first (stable), matching the search page's sort, then the
  // top 4 of that. These are the most attractive coaches to a new visitor.
  const topCoaches = [...sampleCoaches]
    .sort(
      (a, b) =>
        Number(getEffectiveAvailability(b.coachAvailability, b.coachChatPrice, b.coachCallPrice) === "AVAILABLE") -
        Number(getEffectiveAvailability(a.coachAvailability, a.coachChatPrice, a.coachCallPrice) === "AVAILABLE"),
    )
    .slice(0, 4);

  const minElo = eloAgg._min.chessRating;
  const maxElo = eloAgg._max.chessRating;
  const lessonsTaught = lessonsAgg._sum.lessonsGiven ?? 0;

  // Honest value chips: a real ELO range when we have one, plus product promises
  // that stay true no matter how small the marketplace is today.
  const stats: { label: string; sub: string }[] = [];
  if (minElo != null && maxElo != null) {
    stats.push({ label: `${minElo}–${maxElo}`, sub: "Coach ELO range" });
  }
  stats.push({ label: "First 3", sub: "lessons free" });
  stats.push({ label: "Live board", sub: "synced in every lesson" });
  if (lessonsTaught >= 25) {
    stats.push({ label: `${lessonsTaught}+`, sub: "lessons taught" });
  } else {
    stats.push({ label: "/ 30 min", sub: "pay per slot, no subscription" });
  }

  return (
    <div className="flex flex-col items-center px-4 pt-12 pb-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE_URL}/#organization`,
              name: "EloChaser",
              url: SITE_URL,
              description:
                "Online marketplace connecting chess students with one-on-one chess coaches for live lessons.",
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              url: SITE_URL,
              name: "EloChaser",
              publisher: { "@id": `${SITE_URL}/#organization` },
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }}
      />
      {/* Hero */}
      <section className="text-center space-y-6 max-w-2xl">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tighter text-balance">
          Learn faster with your best chess coach
        </h1>
        <p className="text-xl sm:text-2xl font-medium text-muted-foreground text-balance">
          {hasTrials
            ? `One-on-one lessons on a live board. Your first ${trialsRemaining} free.`
            : "One-on-one lessons with real chess coaches, on a live synced board."}
        </p>
        <div className="pt-1">
          <Link href="/search">
            <Button size="lg" className="gap-1.5">
              Find your coach
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Honest value bar */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 max-w-4xl w-full">
        {stats.map((s) => (
          <div key={s.sub} className="text-center rounded-lg border p-4">
            <div className="text-2xl font-bold tracking-tight">{s.label}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Live coach strip - real faces prove there's supply behind the promise. */}
      {topCoaches.length > 0 && (
        <section className="mt-16 max-w-4xl w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Meet a few of the coaches</h2>
            <Link href="/search" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              See all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {topCoaches.map((coach) => {
              const price = startingPrice(coach.coachChatPrice, coach.coachCallPrice);
              return (
                <Link
                  key={coach.id}
                  href={`/profile/${coach.username}`}
                  className="group rounded-lg border p-4 flex flex-col items-center text-center gap-2 transition-colors hover:border-foreground/30 hover:bg-muted/50"
                >
                  <UserAvatar username={coach.username} image={coach.image} size="xl" />
                  <div className="font-medium truncate max-w-full group-hover:underline">
                    {coach.username}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {coach.chessRating != null ? `♝ ${coach.chessRating}` : "Chess coach"}
                  </div>
                  {price != null && (
                    <div className="text-sm font-medium">
                      from ${(price / 100).toFixed(2)} <span className="text-muted-foreground font-normal">/ 30 min</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="mt-20 max-w-4xl w-full">
        <h2 className="text-xl font-semibold text-center mb-8">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <MessagesSquare className="h-6 w-6 text-muted-foreground" />
            <h3 className="font-semibold">1. Find and message</h3>
            <p className="text-sm text-muted-foreground">
              Filter by rating, price, and language. Message any coach free.
            </p>
          </div>
          <div className="space-y-2">
            <CalendarCheck className="h-6 w-6 text-muted-foreground" />
            <h3 className="font-semibold">2. Book a slot</h3>
            <p className="text-sm text-muted-foreground">
              Pay per 30-minute slot, no subscription. First lessons free.
            </p>
          </div>
          <div className="space-y-2">
            <MonitorPlay className="h-6 w-6 text-muted-foreground" />
            <h3 className="font-semibold">3. Learn on a live board</h3>
            <p className="text-sm text-muted-foreground">
              Fix real mistakes together on a shared, synced board.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
