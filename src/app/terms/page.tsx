import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - ChessCoach",
};

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-muted-foreground mb-8">Last updated: May 16, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-6 mb-3">1. Acceptance</h2>
          <p className="leading-relaxed">
            By using ChessCoach (&quot;the Platform&quot;), you agree to these Terms. If you do not agree, do not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">2. What ChessCoach Is</h2>
          <p className="leading-relaxed">
            ChessCoach connects chess students with chess coaches. Coaches set their own prices, availability, and languages. We facilitate booking, payment, and reviews, but we are not a party to any coaching relationship between users.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">3. Accounts</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>You must provide accurate information when creating an account.</li>
            <li>You are responsible for keeping your account credentials secure.</li>
            <li>One account per person. Creating multiple accounts to exploit free trials, evade restrictions, or otherwise abuse the Platform is prohibited.</li>
            <li>You must be at least 13 years old. Users under 18 must have parental consent.</li>
            <li>Neither booking lessons nor offering them requires a chess.com account. Verifying your chess.com account is optional and adds a trust badge to your profile and leaderboard entry.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">4. Payments and Wallet</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Payments are processed by Stripe. ChessCoach does not store full card details.</li>
            <li>When you book a lesson, the cost is reserved from your wallet. If the coach declines or the request expires, the reserved amount is released back automatically.</li>
            <li>Wallet deposits are non-refundable except where required by applicable law. Email <a href="mailto:chesscoach.training@gmail.com" className="underline">chesscoach.training@gmail.com</a> for refund requests.</li>
            <li>Coaches can withdraw any amount of their pending earnings (minimum $5.00) at any time. A fee of $0.40 + 2% applies per withdrawal.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">5. Free Trials</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Every new student account gets up to 3 free trial lessons. Coaches choose whether to accept them.</li>
            <li>Free trials cost nothing. Coaches must successfully complete at least one free trial lesson before they are eligible to receive paid bookings.</li>
            <li>If a coach <strong>declines</strong> a free trial request, the trial is consumed (not refunded to the student) to deter spam. Trials are restored if the coach simply fails to respond and the request expires.</li>
            <li>If a free trial is reported as unsatisfactory and an admin agrees, the trial does not count as a successfully delivered lesson for the coach.</li>
            <li>Abusing the free trial system (e.g. multiple accounts) results in suspension.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">6. Coach Verification (optional)</h2>
          <p className="leading-relaxed">
            Coaches may optionally verify their identity by linking a chess.com account. Verification is reviewed by our admin team and adds a badge to your profile and leaderboard entry. ChessCoach does not guarantee the quality, qualifications, or conduct of any individual coach, verified or otherwise.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">6a. Coach Taxes</h2>
          <p className="leading-relaxed">
            Coaching earnings paid out through ChessCoach are your responsibility to declare to your local tax authority. ChessCoach does not withhold, remit, or report taxes on your behalf. We may issue payout summaries on request.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">7. Booking, No-Shows and Refunds</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Lessons can be booked from a few minutes ahead up to 1 week in advance.</li>
            <li>Coaches are expected to be ready at the scheduled start time. If the coach does not join, the lesson expires and the student is fully refunded.</li>
            <li>If the student does not join at the scheduled start time but the coach is ready, the coach is paid in full to compensate for their reserved time.</li>
            <li>Either party may cancel an accepted lesson before it starts; the student is fully refunded.</li>
            <li>After a lesson, the student has 24 hours to Report Issue. Otherwise, payment auto-transfers to the coach.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">8. Disputes</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>If a student reports a lesson, an admin reviews it before any payment is released.</li>
            <li>Outcomes can include: full refund to student, payment to coach, partial resolution, or account suspension if abuse is found.</li>
            <li>ChessCoach&apos;s decisions on disputes are final.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">9. Prohibited Conduct</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Creating multiple accounts or sharing payment methods to circumvent limits.</li>
            <li>Spamming requests or abusing the booking system.</li>
            <li>Harassment, threats or abuse of other users.</li>
            <li>Bypassing the Platform for off-platform payments to avoid fees.</li>
            <li>Using the Platform for any illegal purpose.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">10. Suspension</h2>
          <p className="leading-relaxed">
            ChessCoach may suspend any account that violates these Terms, engages in fraud, or is flagged by our abuse-detection systems. While suspended, an account cannot book lessons, accept lessons, deposit funds, or be discovered in search. Suspended users may still withdraw any remaining coach earnings. Contact <a href="mailto:chesscoach.training@gmail.com" className="underline">chesscoach.training@gmail.com</a> to appeal.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">11. Limitation of Liability</h2>
          <p className="leading-relaxed">
            The Platform is provided &quot;as is&quot;. To the fullest extent permitted by law, ChessCoach is not liable for any indirect, incidental, or consequential damages, including lost data, revenue or profits, arising from your use of the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">12. Changes</h2>
          <p className="leading-relaxed">
            We may update these Terms at any time. Continued use of the Platform after changes constitutes acceptance. The &quot;Last updated&quot; date above will be revised.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">13. Contact</h2>
          <p className="leading-relaxed">
            Questions? Email{" "}
            <a href="mailto:chesscoach.training@gmail.com" className="underline">chesscoach.training@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
