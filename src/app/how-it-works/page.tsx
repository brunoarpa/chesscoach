import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { auth } from "@/lib/auth";

export default async function HowItWorksPage() {
  const session = await auth();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">How ChessCoach Works</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Whether you want to improve your game or share your knowledge,
          here&apos;s everything you need to know.
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
              Browse coaches or set your own prices to start teaching
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

      {/* For Students */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">
          For Students
        </h2>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <strong>1. Create your account</strong> — Sign up with a username and optional email.
                Choose your continent so coaches near you can be found more easily.
              </p>
              <p>
                <strong>2. Verify your chess.com account</strong> — Go to your{" "}
                <Link href="/profile/edit" className="underline font-medium">profile</Link>{" "}
                and submit your chess.com username. An admin will verify it matches a real account.
                This is required before you can request any lessons.
              </p>
              <p>
                <strong>3. Browse coaches</strong> — Use the{" "}
                <Link href="/search" className="underline font-medium">Find a Coach</Link>{" "}
                page to filter by rating, price, continent, and more. Coach profiles show their
                chess rating, pricing, reviews, and Coach ELO ranking.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Free Trials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Every new account gets <strong>3 free trial lessons</strong>. These let you try
                different coaches before committing to paid lessons.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Free trials work exactly like paid lessons — both parties confirm completion</li>
                <li>You can review the coach after a free trial, and they can review you</li>
                <li>Your chess.com usernames are shared so you can connect and play</li>
                <li>One free trial request at a time, max one per hour</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Booking a Paid Lesson</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <strong>1. Deposit funds</strong> — Visit your{" "}
                <Link href="/wallet" className="underline font-medium">Wallet</Link>{" "}
                and deposit via Stripe. Your balance is held securely and used across all coaches.
              </p>
              <p>
                <strong>2. Request a lesson</strong> — On a coach&apos;s profile, choose the lesson type
                (Lesson or Game Review), set the duration, and submit. The estimated cost is shown
                before you confirm. Funds are reserved from your wallet.
              </p>
              <p>
                <strong>3. Coach accepts</strong> — The coach reviews your request and accepts or
                declines. If declined, your reserved funds are released.
              </p>
              <p>
                <strong>4. Complete the lesson</strong> — After the lesson, both you and the coach
                must mark it as complete (dual confirmation). This prevents disputes and ensures
                both parties agree the lesson happened.
              </p>
              <p>
                <strong>5. Leave a review</strong> — After completion, you can rate the coach 1-5
                stars with an optional comment. Your review helps other students find great coaches.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="my-8" />

      {/* For Coaches */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">
          For Coaches
        </h2>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Setting Up Your Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <strong>Anyone can be a coach.</strong> Once your chess.com account is verified, go to
                your{" "}
                <Link href="/profile/edit" className="underline font-medium">profile settings</Link>{" "}
                and set your prices:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Price per Hour</strong> — For standard lessons</li>
                <li><strong>Game Review Price</strong> — Per ~5 minute game review session</li>
              </ul>
              <p>
                Add a bio, set your communication preference (chat only or chat &amp; call), and
                you&apos;ll appear in search results.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Availability Statuses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>You can control your coaching availability with three statuses:</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400">Available</Badge>
                  <span className="text-muted-foreground">— You appear in search and can receive lesson requests</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Busy</Badge>
                  <span className="text-muted-foreground">— You appear in search but students can&apos;t send requests. Auto-set during active lessons</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Unavailable</Badge>
                  <span className="text-muted-foreground">— Shown in search with unavailable status. Can&apos;t receive requests</span>
                </div>
              </div>
              <p className="text-muted-foreground">
                When you accept a lesson, your status automatically switches to Busy.
                When all active lessons are completed, it switches back to Available.
                You can also quickly toggle your status from the navigation bar,
                or change it in your profile settings.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Managing Lessons</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Your{" "}
                <Link href="/dashboard" className="underline font-medium">Dashboard</Link>{" "}
                shows all lesson requests organized by status:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Pending</strong> — New requests waiting for your response. Accept or decline</li>
                <li><strong>Active</strong> — Accepted lessons in progress. Both you and the student must confirm completion</li>
                <li><strong>Completed</strong> — Finished lessons where you can leave reviews</li>
              </ul>
              <p>
                The student&apos;s chess.com username is shown on active lessons so you can connect
                and start teaching.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="my-8" />

      {/* Payments & Earnings */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">
          Payments &amp; Earnings
        </h2>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Student Wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Students deposit funds into their wallet via Stripe. When you request a lesson,
                the estimated cost is reserved from your balance. If the lesson is declined or
                cancelled, the funds are released back.
              </p>
              <p>
                This &quot;deposit once, spend anywhere&quot; model means no per-lesson payment
                friction — just keep your wallet topped up and request lessons freely.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Coach Earnings &amp; Payouts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                When a lesson is completed, the payment moves from the student&apos;s wallet to
                your pending earnings. At the <strong>end of each month</strong>, all pending
                earnings are paid out to your connected Stripe account.
              </p>
              <p>
                To receive payouts, connect your Stripe account from the Wallet page.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Coach ELO &amp; Rankings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Every coach has an ELO rating that determines their position on the{" "}
                <Link href="/leaderboard" className="underline font-medium">Leaderboard</Link>.
                The rating is based on:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Activity</strong> — Recent coaching activity boosts your rating. Long inactivity causes gradual decay</li>
                <li><strong>Earnings</strong> — Total lifetime earnings contribute to your rating (logarithmic scale, so early lessons matter most)</li>
              </ul>
              <p className="text-muted-foreground">
                Free trial lessons do not affect Coach ELO — only paid lessons count.
                This keeps the leaderboard fair for active, paid coaches.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="my-8" />

      {/* FAQ */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">
          Common Questions
        </h2>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">Can I be both a student and a coach?</h3>
              <p className="text-sm text-muted-foreground">
                Yes! Every account can both take and give lessons. Your dashboard has separate
                tabs for your coach and student activities.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">What happens if a coach doesn&apos;t respond?</h3>
              <p className="text-sm text-muted-foreground">
                Pending requests can expire after a period, and your reserved funds will be
                released. You can also cancel a pending request at any time.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">Why do both parties need to confirm completion?</h3>
              <p className="text-sm text-muted-foreground">
                Dual confirmation ensures both the student and coach agree the lesson took place.
                This protects both parties and prevents disputes over payments.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">How are reviews handled?</h3>
              <p className="text-sm text-muted-foreground">
                After a completed lesson (including free trials), both the student and coach
                can leave a review. You can only leave one review per person. Reviews are 1-5
                stars with an optional comment.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <h3 className="font-semibold mb-1">Is my chess.com username shared?</h3>
              <p className="text-sm text-muted-foreground">
                Yes — during active lessons, your chess.com username is visible to the other
                party so you can connect and play. This is why verification is required before
                requesting lessons.
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
