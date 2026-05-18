import Link from "next/link";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4 pt-12">
      <div className="text-center space-y-4 max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight">
          ♝ ChessCoach
        </h1>
        <p className="text-xl text-muted-foreground">
          Find the perfect chess coach, or share your knowledge.
          Everyone can teach, everyone can learn.
        </p>
      </div>

      <div className="flex gap-4">
        <Link href="/search">
          <Button size="lg">Find a Coach</Button>
        </Link>
        {session?.user ? (
          session.user.needsUsername ? (
            <Link href="/setup-username">
              <Button size="lg" variant="outline">
                Set Up Your Profile →
              </Button>
            </Link>
          ) : (
            <Link href="/dashboard">
              <Button size="lg" variant="outline">
                Dashboard
              </Button>
            </Link>
          )
        ) : (
          <Link href="/login">
            <Button size="lg" variant="outline">
              Get Started
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-4xl w-full">
        <div className="text-center space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">Real Reviews</h3>
          <p className="text-sm text-muted-foreground">
            Coaches build a track record from completed lessons. Optional chess.com badge for extra trust.
          </p>
        </div>
        <div className="text-center space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">15-Minute Lessons</h3>
          <p className="text-sm text-muted-foreground">
            Every lesson is one 15-minute slot. Book back-to-back slots for longer sessions.
          </p>
        </div>
        <div className="text-center space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">Simple Payments</h3>
          <p className="text-sm text-muted-foreground">
            Top up your wallet (up to $20 per deposit) and spend across any coach. No per-lesson checkout.
          </p>
        </div>
      </div>

      <div className="mt-12 text-center p-8 rounded-lg border bg-muted/30 max-w-2xl w-full">
        <h2 className="text-lg font-semibold mb-2">New here?</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Learn how to find coaches, book lessons, or start teaching — all in one guide.
        </p>
        <Link href="/how-it-works">
          <Button variant="outline">How It Works →</Button>
        </Link>
      </div>
    </div>
  );
}
