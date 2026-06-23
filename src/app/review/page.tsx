import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ReviewSession } from "@/components/review/review-session";

export const metadata: Metadata = {
  title: "Free Chess Game Review - Find Your Blunders | EloChaser",
  description:
    "Paste any game and get an instant, free Stockfish review. See every blunder, mistake, and best move, then book a coach to fix the mistakes you keep repeating. No sign-up needed.",
};

// Public, login-free game-review funnel page. Reuses the lesson board's engine.
export default async function ReviewPage() {
  const session = await auth();
  return (
    <div className="h-[calc(100dvh-4rem)]">
      <ReviewSession isLoggedIn={Boolean(session?.user)} />
    </div>
  );
}
