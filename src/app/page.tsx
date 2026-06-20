import Link from "next/link";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-10 px-4 pt-12 pb-16">
      <div className="text-center space-y-5 max-w-2xl">
        <h1 className="text-6xl sm:text-7xl font-bold tracking-tighter text-balance">
          ♝ EloChaser
        </h1>
        <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
          Real chess coaches, on demand.{" "}
          <span className="text-emerald-600 dark:text-emerald-400">Your first lessons are free.</span>
        </p>
        <p className="text-lg text-muted-foreground text-balance">
          Book a one-on-one lesson with a real coach whenever you want one,
          and pay only for the help that actually moves your rating.
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
