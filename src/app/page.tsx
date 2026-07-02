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
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-10 px-4 pt-12 pb-16">
      <div className="text-center space-y-5 max-w-2xl">
        <h1 className="text-6xl sm:text-7xl font-bold tracking-tighter text-balance">
          ♝ EloChaser
        </h1>
        <p className="text-lg sm:text-xl font-medium text-muted-foreground text-balance">
          Stuck at the same rating? Review your game free, then fix your
          mistakes live with a coach.
        </p>
        {hasTrials && (
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">
            Your first {trialsRemaining} lesson{trialsRemaining === 1 ? "" : "s"} free.
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/review">
          <Button size="lg" className="w-full sm:w-auto">Review your game free</Button>
        </Link>
        <Link href="/search">
          <Button size="lg" variant="outline" className="w-full sm:w-auto">Find a coach</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 max-w-4xl w-full">
        <div className="space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">Free game review</h3>
          <p className="text-base text-muted-foreground">
            Spot every blunder in seconds, no sign-up needed.
          </p>
        </div>
        <div className="space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">Free trial lessons</h3>
          <p className="text-base text-muted-foreground">
            Try any coach at no cost before you pay.
          </p>
        </div>
        <div className="space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">Affordable coaches</h3>
          <p className="text-base text-muted-foreground">
            One wallet, every coach. No checkout each time.
          </p>
        </div>
      </div>
    </div>
  );
}
