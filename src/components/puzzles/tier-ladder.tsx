"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { TierStars } from "@/components/puzzles/tier-stars";
import { unlockedCount } from "@/lib/puzzles";
import {
  subscribeGuestSolves,
  guestSolvesSnapshot,
  guestHintsSnapshot,
  guestSolvesServerSnapshot,
} from "@/lib/puzzle-progress";
import { cn } from "@/lib/utils";

interface LadderPuzzle {
  id: string;
  slug: string;
  title: string | null;
  theme: string | null;
}

interface Props {
  tier: { difficulty: number; name: string; blurb: string };
  puzzles: LadderPuzzle[];
  serverSolvedIds: string[];
  serverHintedIds: string[];
  serverUnlocked: number;
  isLoggedIn: boolean;
}

function parseIds(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function TierLadder({
  tier,
  puzzles,
  serverSolvedIds,
  serverHintedIds,
  serverUnlocked,
  isLoggedIn,
}: Props) {
  // Signed-in progress comes from the server. Guests have theirs in
  // sessionStorage, read through useSyncExternalStore so the first paint matches
  // the server markup (empty ladder) and then swaps in on hydration.
  const guestRaw = useSyncExternalStore(
    subscribeGuestSolves,
    guestSolvesSnapshot,
    guestSolvesServerSnapshot,
  );
  const guestHintsRaw = useSyncExternalStore(
    subscribeGuestSolves,
    guestHintsSnapshot,
    guestSolvesServerSnapshot,
  );

  const { solved, hinted, unlocked } = useMemo(() => {
    if (isLoggedIn) {
      return {
        solved: new Set(serverSolvedIds),
        hinted: new Set(serverHintedIds),
        unlocked: serverUnlocked,
      };
    }

    const guestSolved = new Set(parseIds(guestRaw));
    return {
      solved: guestSolved,
      hinted: new Set(parseIds(guestHintsRaw)),
      unlocked: unlockedCount(
        puzzles.map((p) => p.id),
        guestSolved,
      ),
    };
  }, [guestRaw, guestHintsRaw, isLoggedIn, puzzles, serverSolvedIds, serverHintedIds, serverUnlocked]);

  const solvedInTier = puzzles.filter((p) => solved.has(p.id)).length;
  const nextPuzzle = puzzles[Math.min(unlocked - 1, puzzles.length - 1)];
  const complete = solvedInTier === puzzles.length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TierStars difficulty={tier.difficulty} />
            <h2 className="text-xl font-semibold">{tier.name}</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">{tier.blurb}</p>
        </div>
        <div className="text-sm text-muted-foreground shrink-0">
          {solvedInTier} / {puzzles.length}
          {complete && " done"}
        </div>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-16 gap-1.5">
        {puzzles.map((puzzle, i) => {
          const isSolved = solved.has(puzzle.id);
          const isHinted = isSolved && hinted.has(puzzle.id);
          const isLocked = i >= unlocked;
          const isNext = !isSolved && !isLocked && puzzle.id === nextPuzzle?.id;

          if (isLocked) {
            return (
              <div
                key={puzzle.id}
                title="Solve the puzzle before this one to unlock it"
                className="aspect-square rounded border border-dashed flex items-center justify-center text-muted-foreground/40 cursor-not-allowed"
              >
                <Lock className="h-3 w-3" />
              </div>
            );
          }

          return (
            <Link
              key={puzzle.id}
              href={`/puzzles/${puzzle.slug}`}
              className={cn(
                "aspect-square rounded border flex items-center justify-center text-xs font-medium transition-colors hover:bg-accent",
                isSolved &&
                  !isHinted &&
                  "border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                // Solved, but with a hint: amber instead of green so it still shows
                // as done and unlocks on, but reads as "come back and earn this".
                isHinted &&
                  "border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-400",
                isNext && "ring-2 ring-primary",
              )}
              title={`${tier.name} #${i + 1}${isHinted ? " (solved with a hint)" : ""}`}
            >
              {i + 1}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
