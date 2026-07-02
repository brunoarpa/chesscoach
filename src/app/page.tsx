import Link from "next/link";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  return (
    <div className="flex flex-col items-center px-4 pt-16 pb-20 gap-14">
      {/* Hero */}
      <div className="text-center space-y-6 max-w-2xl">
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tighter text-balance">
          Stuck at the same{" "}
          <span className="text-emerald-600 dark:text-emerald-400">rating?</span>
        </h1>
        <p className="text-lg sm:text-2xl text-muted-foreground text-balance">
          Review any game for free, then play through your mistakes live with a
          coach until they stop happening.
        </p>

        {hasTrials && (
          <p className="text-xl sm:text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            Your first {trialsRemaining} lesson{trialsRemaining === 1 ? "" : "s"} {trialsRemaining === 1 ? "is" : "are"} on the house.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link href="/review">
            <Button size="lg" className="w-full sm:w-auto text-base">
              Review your game free
            </Button>
          </Link>
          <Link href="/search">
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base">
              Find a coach
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          No sign-up needed to review a game.
        </p>
      </div>

      {/* Three pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl w-full">
        <div className="space-y-2 p-6 rounded-xl border bg-card text-center">
          <div className="text-3xl">🔍</div>
          <h3 className="font-semibold text-lg">Free game review</h3>
          <p className="text-sm text-muted-foreground">
            Paste any game and see every blunder in seconds, powered by the same
            engine your coach uses.
          </p>
        </div>
        <div className="space-y-2 p-6 rounded-xl border bg-card text-center">
          <div className="text-3xl">🎁</div>
          <h3 className="font-semibold text-lg">Free trial lessons</h3>
          <p className="text-sm text-muted-foreground">
            Try coaches with zero risk. You only pay once you have found one
            worth keeping.
          </p>
        </div>
        <div className="space-y-2 p-6 rounded-xl border bg-card text-center">
          <div className="text-3xl">♟️</div>
          <h3 className="font-semibold text-lg">Affordable coaches</h3>
          <p className="text-sm text-muted-foreground">
            Top up one wallet and spend it with any coach. No checkout, no
            PayPal-ing strangers before every lesson.
          </p>
        </div>
      </div>
    </div>
  );
}
