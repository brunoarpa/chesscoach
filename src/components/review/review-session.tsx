"use client";

import { useState } from "react";
import Link from "next/link";
import { ChessBoard, type ReviewReport } from "@/components/lesson/chess-board";
import { MOVE_CLASS_STYLE } from "@/components/lesson/move-class-style";
import { Button } from "@/components/ui/button";
import { Search, UserPlus } from "lucide-react";
import { MOVE_CLASSES } from "@/lib/game-review";

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
    <div>
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
// Renders as soon as a game is loaded - counts are "?" until analysis completes
// (chess.com-style), every class row is always shown, and the columns are
// headed by the players' names.
function ReportBreakdown({ report }: { report: ReviewReport | null }) {
  if (!report) return null;
  const { whiteName, blackName, summary } = report;
  return (
    <div>
      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-semibold border-b bg-muted/40">
          <span className="flex items-center gap-1 min-w-0">
            <span className="h-2.5 w-2.5 rounded-sm border border-border bg-white shrink-0" />
            <span className="truncate" title={whiteName}>{whiteName}</span>
          </span>
          <span className="flex items-center gap-1 min-w-0 justify-end">
            <span className="truncate" title={blackName}>{blackName}</span>
            <span className="h-2.5 w-2.5 rounded-sm border border-border bg-zinc-800 shrink-0" />
          </span>
        </div>
        <div className="divide-y">
          {MOVE_CLASSES.filter((c) => c !== "forced").map((c) => {
            const s = MOVE_CLASS_STYLE[c];
            const w = summary ? summary.white.counts[c] : null;
            const b = summary ? summary.black.counts[c] : null;
            return (
              <div key={c} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center px-3 py-1 text-sm">
                <span className="text-left tabular-nums">{w ?? "?"}</span>
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
                <span className="text-right tabular-nums">{b ?? "?"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReviewSession({
  isLoggedIn,
  initialFen,
}: {
  isLoggedIn: boolean;
  // When present, the board opens directly on this position (a puzzle sent over
  // from the puzzles page for analysis) instead of the "paste your game" panel.
  initialFen?: string;
}) {
  const [report, setReport] = useState<ReviewReport | null>(null);
  const fromPuzzle = Boolean(initialFen);

  // Left column (under the board's report card): move-type table, then the CTA.
  const leftPanel = (
    <>
      <ReportBreakdown report={report} />
      <CtaCard isLoggedIn={isLoggedIn} />
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base font-semibold">
            {fromPuzzle ? "Analyze the puzzle" : "Review your game"}
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 bg-primary/5 text-primary">
            {fromPuzzle ? "Engine on" : "Free, no sign-up"}
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/search">Find a coach</Link>
        </Button>
      </div>

      {/* ChessBoard owns the responsive layout: 3 columns on desktop
          (report+table+coach | board | move list), stacked on mobile with a
          horizontal move strip. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <ChessBoard
          local
          startImportOpen={!fromPuzzle}
          initialFen={initialFen}
          multiPane
          lessonId={REVIEW_LESSON_ID}
          userId={REVIEW_USER_ID}
          isCoach={false}
          onReport={setReport}
          leftPanel={leftPanel}
        />
      </div>
    </div>
  );
}
