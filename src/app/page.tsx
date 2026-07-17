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

// Shared by the visible FAQ section and its FAQPage structured data, so the
// two can never drift apart (Google requires the markup to match the page).
const FAQS: { q: string; a: string }[] = [
  {
    q: "How much does an online chess coach cost?",
    a: "On EloChaser, coaches set their own prices and lessons start from as little as a few dollars per 30-minute slot. Prices generally scale with a coach's rating, so lower-rated coaches are the cheapest way to start. You filter by budget, and there is no subscription: you pay per slot.",
  },
  {
    q: "Are the first chess lessons really free?",
    a: "Yes. New students get their first lessons free so you can try a coach before paying anything. You can also message any coach for free before booking.",
  },
  {
    q: "How do online chess lessons work?",
    a: "Lessons happen on a live, shared chess board that you and your coach both control while you talk. A typical session reviews one of your recent games, teaches the theme you most need, and sends you off with something to practice.",
  },
  {
    q: "What rating should my chess coach be?",
    a: "A coach rated comfortably above you is enough, you do not need a grandmaster. For most players under 1500, a coach rated 1800 to 2000 is ideal, and often more affordable.",
  },
  {
    q: "Do I really need a chess coach to improve?",
    a: "If you are an absolute beginner still learning the rules and basic tactics, playing lots of games and solving puzzles will improve you for a while. Once you plateau and cannot see why you keep losing, a coach is the fastest way forward because they spot the blind spots you cannot see on your own.",
  },
];

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
        <h2 className="text-2xl font-semibold text-center mb-10">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="rounded-full bg-muted p-4">
              <MessagesSquare className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold">1. Find and message</h3>
            <p className="text-muted-foreground">
              Filter by rating, price, and language. Message any coach free.
            </p>
          </div>
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="rounded-full bg-muted p-4">
              <CalendarCheck className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold">2. Book a slot</h3>
            <p className="text-muted-foreground">
              Pay per 30-minute slot, no subscription. First lessons free.
            </p>
          </div>
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="rounded-full bg-muted p-4">
              <MonitorPlay className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold">3. Learn on a live board</h3>
            <p className="text-muted-foreground">
              Fix real mistakes together on a shared, synced board.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-20 max-w-3xl w-full">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }}
        />
        <h2 className="text-xl font-semibold text-center mb-8">
          Frequently asked questions
        </h2>
        <div className="divide-y">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer font-medium list-none flex justify-between items-center gap-4">
                {f.q}
                <span className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-20 max-w-3xl w-full space-y-8 text-muted-foreground leading-relaxed">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">
            Online chess coaching, made simple
          </h2>
          <p>
            EloChaser is an online chess coaching marketplace that connects you
            with a personal chess coach for live, one-on-one lessons. Every
            lesson happens on a shared, synced board that you and your coach
            control together, so you learn by fixing your own games in real
            time instead of watching generic videos. You can find an online
            chess coach in your exact rating range, message any coach for free
            before you book, and get your first lessons free.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">
            Why one-on-one coaching beats studying alone
          </h3>
          <p>
            Apps and puzzle trainers are great for volume, but they cannot see
            why you keep making the same mistakes. A coach watches how you
            think, spots the blind spot behind your losses, and tells you the
            one thing to work on next. That is why players who plateau on their
            own often break through quickly once they start working with an
            online chess coach. Read more in{" "}
            <Link href="/blog/is-a-chess-coach-worth-it" className="text-primary underline underline-offset-2">
              is a chess coach worth it
            </Link>
            .
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">
            A chess coach for every level and budget
          </h3>
          <p>
            Whether you are a complete beginner learning your first openings or
            an intermediate player pushing toward 2000, there is a coach for
            you. Prices start from just a few dollars per 30-minute slot and
            scale with a coach&apos;s rating, so you can find affordable chess
            coaching for beginners or book a stronger coach for serious
            tournament preparation. You pay per slot, with no subscription.{" "}
            <Link href="/search" className="text-primary underline underline-offset-2">
              Browse chess coaches by rating and price
            </Link>
            .
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">
            Learn chess the way that actually sticks
          </h3>
          <p>
            The fastest way to improve is to review your real games with someone
            who can explain what went wrong. On EloChaser your coach reviews
            your games, teaches the theme you most need, and sends you off with
            a clear plan, all on a live board. Not sure where to start? Our blog
            covers{" "}
            <Link href="/blog/how-to-improve-your-chess-rating" className="text-primary underline underline-offset-2">
              how to improve your chess rating
            </Link>{" "}
            and{" "}
            <Link href="/blog/how-online-chess-coaching-works" className="text-primary underline underline-offset-2">
              what to expect from online chess coaching
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
