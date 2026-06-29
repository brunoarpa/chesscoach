"use client";

import Link from "next/link";
import { ChessBoard } from "@/components/lesson/chess-board";
import { Button } from "@/components/ui/button";
import { Search, UserPlus } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";

// Public, login-free game review. Reuses the real lesson board (same engine,
// eval bar, and per-move classification a coach uses in a lesson) so a visitor
// can paste their own game and instantly see their blunders. It is the top of
// the funnel: the soft-gate CTA nudges them toward a coach to fix what the
// engine just exposed.
const REVIEW_LESSON_ID = "review";
const REVIEW_USER_ID = "review-user";

// The board only runs the engine on desktop (Stockfish is too heavy for a phone
// CPU), so the analysis copy is desktop-targeted; phones still get the board.

function CtaCard({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold text-base">See a mistake you keep making?</h2>
        <p className="text-sm text-muted-foreground">
          A coach can walk through this exact game with you on a live board and show you how to
          stop repeating it. Your first lesson is free.
        </p>
        <Button asChild className="w-full">
          <Link href="/search">
            <Search className="h-4 w-4 mr-1.5" />
            Find a coach
          </Link>
        </Button>
        {!isLoggedIn && (
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">
              <UserPlus className="h-4 w-4 mr-1.5" />
              Sign up free
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReviewSession({ isLoggedIn }: { isLoggedIn: boolean }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base font-semibold">Review your game</h1>
          <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 bg-primary/5 text-primary">
            Free, no sign-up
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/search">Find a coach</Link>
        </Button>
      </div>

      {isDesktop ? (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex justify-center items-start p-4 overflow-y-auto min-h-0">
            <ChessBoard
              local
              startImportOpen
              lessonId={REVIEW_LESSON_ID}
              userId={REVIEW_USER_ID}
              isCoach={false}
            />
          </div>
          <div className="w-[360px] border-l flex flex-col min-h-0 overflow-y-auto">
            <CtaCard isLoggedIn={isLoggedIn} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
          <div className="p-2 flex justify-center items-start">
            <ChessBoard
              local
              startImportOpen
              lessonId={REVIEW_LESSON_ID}
              userId={REVIEW_USER_ID}
              isCoach={false}
            />
          </div>
          <div className="border-t">
            <CtaCard isLoggedIn={isLoggedIn} />
          </div>
        </div>
      )}
    </div>
  );
}
