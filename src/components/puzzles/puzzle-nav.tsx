"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  subscribeGuestSolves,
  guestSolvesSnapshot,
  guestSolvesServerSnapshot,
} from "@/lib/puzzle-progress";
import { cn } from "@/lib/utils";

interface Props {
  puzzleId: string;
  prevSlug: string | null;
  nextSlug: string | null;
  isLoggedIn: boolean;
  // Whether the signed-in user has already solved THIS puzzle (server-known).
  alreadySolved: boolean;
}

/**
 * Prev/next jumps between puzzles in a tier. Prev is always available (earlier
 * puzzles are already unlocked), but Next stays disabled until the current puzzle
 * is solved, so it can't be used to skip ahead past locked puzzles. Solve state is
 * server-known for signed-in users and lives in sessionStorage for guests, which is
 * why this is a client component.
 */
export function PuzzleNav({ puzzleId, prevSlug, nextSlug, isLoggedIn, alreadySolved }: Props) {
  const guestRaw = useSyncExternalStore(
    subscribeGuestSolves,
    guestSolvesSnapshot,
    guestSolvesServerSnapshot,
  );

  let solvedCurrent = alreadySolved;
  if (!isLoggedIn) {
    try {
      const parsed: unknown = guestRaw ? JSON.parse(guestRaw) : [];
      solvedCurrent = Array.isArray(parsed) && parsed.includes(puzzleId);
    } catch {
      solvedCurrent = false;
    }
  }

  const nextEnabled = !!nextSlug && solvedCurrent;

  const base = "inline-flex items-center rounded-md px-2 py-1";
  const active = "text-muted-foreground hover:bg-accent hover:text-foreground";
  const disabled = "text-muted-foreground/40 cursor-not-allowed";

  return (
    <div className="flex items-center gap-1 text-sm">
      {prevSlug ? (
        <Link href={`/puzzles/${prevSlug}`} className={cn(base, active)}>
          <ChevronLeft className="h-4 w-4 mr-0.5" />
          Prev
        </Link>
      ) : (
        <span className={cn(base, disabled)}>
          <ChevronLeft className="h-4 w-4 mr-0.5" />
          Prev
        </span>
      )}

      {nextEnabled ? (
        <Link href={`/puzzles/${nextSlug}`} className={cn(base, active)}>
          Next
          <ChevronRight className="h-4 w-4 ml-0.5" />
        </Link>
      ) : (
        <span
          className={cn(base, disabled)}
          title={nextSlug ? "Solve this puzzle to move on" : undefined}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-0.5" />
        </span>
      )}
    </div>
  );
}
