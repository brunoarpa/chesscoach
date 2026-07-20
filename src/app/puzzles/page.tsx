import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUZZLE_TIERS, unlockedCount } from "@/lib/puzzles";
import { GuestSolveMerger } from "@/components/puzzles/guest-solve-merger";
import { TierLadder } from "@/components/puzzles/tier-ladder";
import { Button } from "@/components/ui/button";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Chess Puzzles: Tactics Training in 5 Difficulty Tiers",
  description:
    "Free chess tactics puzzles, from one-move warm-ups to master-level sacrifices. Work through five tiers of hand-picked positions. No account needed to start.",
  alternates: { canonical: `${SITE_URL}/puzzles` },
};

export default async function PuzzlesPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const [puzzles, solves] = await Promise.all([
    prisma.puzzle.findMany({
      where: { published: true },
      orderBy: [{ difficulty: "asc" }, { orderIndex: "asc" }],
      select: {
        id: true,
        slug: true,
        difficulty: true,
        orderIndex: true,
        title: true,
        theme: true,
      },
    }),
    userId
      ? prisma.puzzleSolve.findMany({
          where: { userId },
          select: { puzzleId: true, usedHint: true },
        })
      : Promise.resolve([]),
  ]);

  // Signed-in progress comes from the DB. Guests get theirs hydrated client-side
  // from sessionStorage, since it must not survive them leaving the site.
  const serverSolved = solves.map((s) => s.puzzleId);
  const serverHinted = solves.filter((s) => s.usedHint).map((s) => s.puzzleId);
  const totalSolved = serverSolved.length;

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl space-y-8">
      {userId && <GuestSolveMerger />}

      <header className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Chess puzzles</h1>
        {!userId && (
          <div className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm text-muted-foreground">
              You can solve everything without an account, but your progress is wiped when you
              close the tab.
            </p>
            <Button asChild size="sm" className="shrink-0">
              <Link href="/signup?callbackUrl=/puzzles">Save my progress</Link>
            </Button>
          </div>
        )}
        {userId && puzzles.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {totalSolved} of {puzzles.length} solved.
          </p>
        )}
      </header>

      {puzzles.length === 0 ? (
        <p className="text-muted-foreground">No puzzles published yet. Check back soon.</p>
      ) : (
        <div className="space-y-10">
          {PUZZLE_TIERS.map((tier) => {
            const tierPuzzles = puzzles.filter((p) => p.difficulty === tier.difficulty);
            if (tierPuzzles.length === 0) return null;

            const ids = tierPuzzles.map((p) => p.id);
            const unlocked = unlockedCount(ids, new Set(serverSolved));

            return (
              <TierLadder
                key={tier.difficulty}
                tier={tier}
                puzzles={tierPuzzles.map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  title: p.title,
                  theme: p.theme,
                }))}
                serverSolvedIds={serverSolved}
                serverHintedIds={serverHinted}
                serverUnlocked={unlocked}
                isLoggedIn={!!userId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
