import Link from "next/link";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-10 px-4 pt-12 pb-16">
      <div className="text-center space-y-5 max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-sm text-muted-foreground">
          ♝ Live 1-on-1 chess coaching
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-balance">
          Get better at chess, 15 minutes at a time
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground text-balance">
          Book a real coach for a short, focused lesson, whenever you want one.
          Strong player yourself? List your own slots and get paid to teach.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/search">
          <Button size="lg" className="w-full sm:w-auto">Find a Coach</Button>
        </Link>
        {session?.user ? (
          session.user.needsUsername ? (
            <Link href="/setup-username">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Set Up Your Profile →
              </Button>
            </Link>
          ) : (
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Dashboard
              </Button>
            </Link>
          )
        ) : (
          <Link href="/login">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Sign up free
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 max-w-4xl w-full">
        <div className="space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">One wallet, every coach</h3>
          <p className="text-base text-muted-foreground">
            Top up once and spend it with any coach on the platform. No re-entering your
            card, no PayPal-ing strangers, no checkout before every lesson.
          </p>
        </div>
        <div className="space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">Short, focused lessons</h3>
          <p className="text-base text-muted-foreground">
            Every lesson is one 15-minute slot, so it stays cheap and easy to fit in.
            Want a deep dive? Book back-to-back slots for a longer session.
          </p>
        </div>
        <div className="space-y-2 p-6 rounded-lg border">
          <h3 className="font-semibold text-lg">Coaches you can trust</h3>
          <p className="text-base text-muted-foreground">
            Ratings are built from real completed lessons, not self-reported claims.
            Coaches can add a verified chess.com badge for extra proof.
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground text-center">
        Try it risk-free: every new student gets up to 3 free trial lessons.
      </p>
    </div>
  );
}
