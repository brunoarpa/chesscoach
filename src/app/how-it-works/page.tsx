import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { auth } from "@/lib/auth";

export default async function HowItWorksPage() {
  const session = await auth();

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-10 sm:mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">How EloChaser Works</h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
          Find a coach, book a lesson, improve your game. That&apos;s it.
        </p>
      </div>

      {/* Lesson Flow */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">How a lesson works</h2>

        <ol className="relative border-l border-muted-foreground/20 ml-4 space-y-6">
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            <p className="font-semibold">Student books a slot</p>
            <p className="text-sm text-muted-foreground">
              Pick a time from the coach&apos;s calendar (anywhere from a few minutes ahead up to 1 week out). The cost is reserved from your wallet.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            <p className="font-semibold">Coach accepts</p>
            <p className="text-sm text-muted-foreground">
              The coach has up to the lesson start (and at most 24h) to accept. If they decline or don&apos;t respond, your funds are released automatically.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
            <p className="font-semibold">Both confirm start</p>
            <p className="text-sm text-muted-foreground">
              When it&apos;s time, both open the lesson page in the dashboard. The lesson runs in-app — chess board, chat, and (for call lessons) video. Both click &quot;Confirm Start&quot; to begin.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
            <p className="font-semibold">Have the lesson</p>
            <p className="text-sm text-muted-foreground">
              Play, analyze positions, or review games together.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
            <p className="font-semibold">Auto-completion</p>
            <p className="text-sm text-muted-foreground">
              24 hours after the scheduled end, payment moves to the coach automatically. If the student hits Report Issue in that window, the payment is frozen until an admin reviews it, no matter how much time passes.
            </p>
          </li>
          <li className="pl-8">
            <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">6</span>
            <p className="font-semibold">Reviews</p>
            <p className="text-sm text-muted-foreground">
              Rate each other 1–5 stars with an optional comment.
            </p>
          </li>
        </ol>

        {/* Try the lesson room hands-on, no booking needed */}
        <Card className="mt-8 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 pt-6">
            <div className="flex-1">
              <p className="font-semibold">Want to see what a lesson looks like?</p>
              <p className="text-sm text-muted-foreground">
                Open a free practice room with the real board, chat, and tools, just for you. Play both
                sides and explore. No sign-up, nothing saved.
              </p>
            </div>
            <Link href="/lesson/practice">
              <Button className="w-full sm:w-auto">Try a practice lesson</Button>
            </Link>
          </CardContent>
        </Card>
      </section>

      <Separator className="my-8" />

      {/* No-shows */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">No-shows and refunds</h2>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <p>
              <strong>If the coach doesn&apos;t show up:</strong> the lesson is cancelled and the student is fully refunded. The coach receives an ELO penalty.
            </p>
            <p>
              <strong>If the student doesn&apos;t show up</strong> (or shows up late) but the coach is ready: the coach is paid in full. Your time matters.
            </p>
            <p className="text-muted-foreground">
              Either party can cancel an accepted lesson before it starts and the student is fully refunded.
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator className="my-8" />

      {/* Free Trials */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Free trials</h2>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <p>
              Every new account gets up to <strong>3 free trial lessons</strong>. Try different coaches before paying.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
              <li>Same flow as paid lessons. You can leave reviews after a trial.</li>
              <li>One pending free trial at a time, max one per hour.</li>
              <li>Coaches must successfully complete <strong>at least one free trial</strong> before they can receive paid bookings.</li>
              <li>To prevent spamming or misuse, if a coach <strong>declines</strong> your trial request, the trial is consumed, so pick coaches carefully.</li>
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
              <CardTitle className="text-base">Student wallet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Deposit via Stripe ($0.40 + 2% fee, up to $20 per deposit). Your balance is used across all coaches — no per-lesson payment friction. When you book, the cost is reserved until the lesson completes or is cancelled.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coach payouts</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              When a lesson completes, earnings move to your pending balance. Withdraw whenever you have $25+ — just a $0.40 + 0.5% transfer fee, plus Stripe&apos;s $2 monthly payout fee on your first withdrawal each month. Bigger, less frequent withdrawals mean lower fees.
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="my-8" />

      {/* For Coaches */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">For coaches</h2>
        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            <p>
              <strong>Anyone can coach.</strong> Set a chat or call price per 15 minutes and pick at least one teaching language in your{" "}
              <Link href="/profile/edit" className="underline font-medium">profile</Link>. Verifying your chess.com account is optional and adds a badge. It does not gate coaching or payouts.
            </p>
            <p className="text-muted-foreground">
              Your <strong>Coach ELO</strong> on the{" "}
              <Link href="/leaderboard" className="underline">leaderboard</Link>{" "}
              is based on recent activity and earnings. Both decay over time if you go quiet (roughly a 7-day half-life for activity, 30 days for earnings). No-shows cost 50 ELO each.
            </p>
            <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
              <strong>Taxes:</strong> Coaching earnings paid via EloChaser are yours to declare to your local tax authority. We don&apos;t withhold or remit taxes on your behalf.
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
              <h3 className="font-semibold mb-1">Do I need a chess.com account?</h3>
              <p className="text-sm text-muted-foreground">
                No. Neither students nor coaches need one to use EloChaser. Coaches can optionally verify their chess.com account for a trust badge.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">Can I be both a student and a coach?</h3>
              <p className="text-sm text-muted-foreground">
                Yes. Your dashboard has separate sections for coaching and learning.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">What if a coach doesn&apos;t respond?</h3>
              <p className="text-sm text-muted-foreground">
                Pending requests expire automatically and your funds are released. You can also cancel anytime.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">What if the lesson was bad?</h3>
              <p className="text-sm text-muted-foreground">
                Within 24 hours of the scheduled end, hit Report Issue on the lesson card. An admin reviews before any money moves.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">Is my chess.com username shared?</h3>
              <p className="text-sm text-muted-foreground">
                No. Even if you verify, only a ✓ chess.com badge is shown publicly — never the username itself. We use it server-side to refresh your chess.com rating.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">What happens if my account is suspended?</h3>
              <p className="text-sm text-muted-foreground">
                You can&apos;t book, accept, or deposit, and you won&apos;t appear in search. You can still withdraw any coach earnings. Email support to appeal.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
          <Link href="/search">
            <Button size="lg" className="w-full sm:w-auto">Find a Coach</Button>
          </Link>
          {session?.user ? (
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">Go to Dashboard</Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">Get Started</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
