import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { auth } from "@/lib/auth";

export default async function HowItWorksPage() {
  const session = await auth();

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">How ChessCoach Works</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Find a coach, book a lesson, improve your game. It&apos;s that simple.
        </p>
      </div>

      {/* Quick Start */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold mb-2">1.</div>
            <h3 className="font-semibold mb-1">Sign Up &amp; Verify</h3>
            <p className="text-sm text-muted-foreground">
              Create an account and link your chess.com profile
            </p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold mb-2">2.</div>
            <h3 className="font-semibold mb-1">Find or Become a Coach</h3>
            <p className="text-sm text-muted-foreground">
              Browse coaches or set your prices to start teaching
            </p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold mb-2">3.</div>
            <h3 className="font-semibold mb-1">Learn &amp; Grow</h3>
            <p className="text-sm text-muted-foreground">
              Take lessons, leave reviews, and climb the ratings
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-8" />

      {/* Lesson Flow */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">How a Lesson Works</h2>

        <ol className="relative border-l border-muted-foreground/20 ml-4 space-y-6">
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            <p className="font-semibold">Student Requests a Lesson</p>
            <p className="text-sm text-muted-foreground">
              Visit a coach&apos;s profile, choose a duration, and send a request.
              The estimated cost is reserved from your wallet.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            <p className="font-semibold">Coach Accepts or Declines</p>
            <p className="text-sm text-muted-foreground">
              The coach reviews your request. If they decline, your funds are released immediately.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
            <p className="font-semibold">Both Confirm Start</p>
            <p className="text-sm text-muted-foreground">
              Contact each other via Chess.com. Once you&apos;re both ready, confirm the lesson has started.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
            <p className="font-semibold">Have the Lesson</p>
            <p className="text-sm text-muted-foreground">
              Play, analyze, learn — whatever you agreed on.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
            <p className="font-semibold">Both Confirm Completion</p>
            <p className="text-sm text-muted-foreground">
              When the lesson is done, both sides confirm it&apos;s complete. Payment is then transferred to the coach.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">6</span>
            <p className="font-semibold">Leave Reviews</p>
            <p className="text-sm text-muted-foreground">
              Rate each other 1–5 stars with an optional comment. Reviews help others find great coaches.
            </p>
          </li>
        </ol>
      </section>

      <Separator className="my-8" />

      {/* Free Trials */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Free Trials</h2>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <p>
              Every new account gets <strong>3 free trial lessons</strong>. Try different coaches before committing to paid lessons.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
              <li>Free trials follow the same flow — both parties confirm completion</li>
              <li>You can leave reviews after free trials</li>
              <li>One free trial request at a time, max one per hour</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <Separator className="my-8" />

      {/* Payments */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Payments</h2>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Student Wallet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Deposit funds via Stripe. A small processing fee (€0.40 + 2%) applies. Your balance is used across all coaches — no per-lesson payment friction.
              When you request a lesson, funds are reserved until the lesson completes or is cancelled.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coach Payouts</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              When a lesson completes, earnings move to your pending balance.
              Withdraw anytime from your wallet (minimum €5.00). A small fee of €0.40 + 2% applies per withdrawal.
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="my-8" />

      {/* For Coaches */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">For Coaches</h2>
        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            <p>
              <strong>Anyone can coach.</strong> Once verified, set your price per 5 minutes in your{" "}
              <Link href="/profile/edit" className="underline font-medium">profile settings</Link>.
            </p>
            <p className="text-muted-foreground">
              Your <strong>Coach ELO</strong> on the{" "}
              <Link href="/leaderboard" className="underline">Leaderboard</Link>{" "}
              is based on your activity and earnings — stay active and give lessons to climb the rankings.
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator className="my-8" />

      {/* FAQ */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">FAQ</h2>

        <div className="space-y-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">Can I be both a student and a coach?</h3>
              <p className="text-sm text-muted-foreground">
                Yes! Your dashboard has separate sections for coaching and learning.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">What if a coach doesn&apos;t respond?</h3>
              <p className="text-sm text-muted-foreground">
                Pending requests can expire, and your funds are released. You can also cancel anytime.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">Why do both parties confirm completion?</h3>
              <p className="text-sm text-muted-foreground">
                Dual confirmation ensures both sides agree the lesson happened, preventing payment disputes.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">Is my Chess.com username shared?</h3>
              <p className="text-sm text-muted-foreground">
                Yes — during active lessons your username is visible so you can connect and play.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
        <div className="flex justify-center gap-4">
          <Link href="/search">
            <Button size="lg">Find a Coach</Button>
          </Link>
          {session?.user ? (
            <Link href="/dashboard">
              <Button size="lg" variant="outline">Go to Dashboard</Button>
            </Link>
          ) : (
            <Link href="/signup">
              <Button size="lg" variant="outline">Create Account</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
