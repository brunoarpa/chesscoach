"use client";

import { useState } from "react";
import Link from "next/link";
import { ChessBoard } from "@/components/lesson/chess-board";
import { MOVE_CLASS_STYLE } from "@/components/lesson/move-class-style";
import { Button } from "@/components/ui/button";
import { Search, UserPlus } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { MOVE_CLASSES, type GameReviewSummary } from "@/lib/game-review";

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

// Per-class move breakdown (Brilliant / Great / ... / Blunder) for both sides,
// shown in the sidebar below the CTA so the central board column stays clean.
function ReportBreakdown({ summary }: { summary: GameReviewSummary | null }) {
  if (!summary) return null;
  const rows = MOVE_CLASSES.filter((c) => summary.white.counts[c] || summary.black.counts[c]);
  if (rows.length === 0) return null;
  return (
    <div className="px-4 pb-4">
      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center px-3 py-1.5 text-[11px] font-semibold text-muted-foreground border-b bg-muted/40">
          <span className="text-left">White</span>
          <span className="text-center">Move</span>
          <span className="text-right">Black</span>
        </div>
        <div className="divide-y">
          {rows.map((c) => {
            const s = MOVE_CLASS_STYLE[c];
            return (
              <div key={c} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center px-3 py-1 text-sm">
                <span className="text-left tabular-nums">{summary.white.counts[c]}</span>
                <span className="flex items-center justify-center gap-1.5 font-medium" style={{ color: s.badge }}>
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center rounded-full text-white font-bold"
                    style={{ background: s.badge, width: 16, height: 16, fontSize: 10, lineHeight: 1 }}
                  >
                    {s.symbol}
                  </span>
                  {s.label}
                </span>
                <span className="text-right tabular-nums">{summary.black.counts[c]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReviewSession({ isLoggedIn }: { isLoggedIn: boolean }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [summary, setSummary] = useState<GameReviewSummary | null>(null);

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
              onReviewSummary={setSummary}
            />
          </div>
          <div className="w-[360px] border-l flex flex-col min-h-0 overflow-y-auto">
            <CtaCard isLoggedIn={isLoggedIn} />
            <ReportBreakdown summary={summary} />
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
              onReviewSummary={setSummary}
            />
          </div>
          <div className="border-t">
            <CtaCard isLoggedIn={isLoggedIn} />
            <ReportBreakdown summary={summary} />
          </div>
        </div>
      )}
    </div>
  );
}
