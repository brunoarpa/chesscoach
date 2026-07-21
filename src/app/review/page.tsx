import type { Metadata } from "next";
import { Chess } from "chess.js";
import { auth } from "@/lib/auth";
import { ReviewSession } from "@/components/review/review-session";

export const metadata: Metadata = {
  title: "Free Chess Game Review - Find Your Blunders | EloChaser",
  description:
    "Paste any game and get an instant, free Stockfish review. See every blunder, mistake, and best move, then book a coach to fix the mistakes you keep repeating. No sign-up needed.",
};

// Public, login-free game-review funnel page. Reuses the lesson board's engine.
// A `?fen=` param (sent from a solved puzzle) opens the board on that position
// for free-form engine analysis instead of the paste-your-game panel.
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ fen?: string }>;
}) {
  const session = await auth();
  const { fen } = await searchParams;
  // Only hand a legal position to the board; a bad/garbage fen falls back to the
  // normal paste-your-game panel rather than a broken board.
  let initialFen: string | undefined;
  if (fen) {
    try {
      new Chess(fen);
      initialFen = fen;
    } catch {
      initialFen = undefined;
    }
  }
  return (
    <div className="h-[calc(100dvh-4rem)]">
      <ReviewSession isLoggedIn={Boolean(session?.user)} initialFen={initialFen} />
    </div>
  );
}
