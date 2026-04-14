import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - ChessCoach",
};

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-muted-foreground mb-8">Last updated: April 14, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">1. Acceptance of Terms</h2>
          <p className="leading-relaxed">
            By creating an account or using ChessCoach (&quot;the Platform&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">2. Description of Service</h2>
          <p className="leading-relaxed">
            ChessCoach connects chess students with chess coaches. Coaches set their own prices and availability. The Platform facilitates lesson requests, payments, and reviews but is not a party to the coaching relationship.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">3. Accounts</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>You must provide accurate information when creating an account.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>One account per person. Creating multiple accounts to exploit free trials, promotions, or to evade bans is prohibited and may result in permanent suspension.</li>
            <li>You must be at least 13 years old to use the Platform. Users under 18 should have parental consent.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">4. Payments &amp; Wallet</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>All payments are processed securely through Stripe. ChessCoach does not store your full card details.</li>
            <li>When you request a lesson, the estimated cost is reserved from your wallet balance. If the coach declines or the request expires, the reserved amount is released back to your wallet.</li>
            <li>Wallet deposits are non-refundable except where required by applicable law. Contact <a href="mailto:chesscoach.training@gmail.com" className="underline">chesscoach.training@gmail.com</a> for refund requests.</li>
            <li>Coach earnings are paid out monthly via Stripe Connect. ChessCoach does not guarantee a minimum income for coaches.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">5. Free Trials</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>New accounts receive up to 3 free trial lesson requests. Free trials are at the coach&apos;s discretion to accept.</li>
            <li>Free trials carry no cost for either party.</li>
            <li>Abuse of the free trial system (including creating multiple accounts) will result in account suspension.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">6. Coach Verification</h2>
          <p className="leading-relaxed">
            Coaches must verify their identity through a linked Chess.com account. Verification is reviewed by our admin team. ChessCoach does not guarantee the quality, qualifications, or suitability of any coach.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">7. Lesson Confirmation &amp; Disputes</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>After a coach accepts a request, both parties must confirm lesson completion within 48 hours of the confirmation window.</li>
            <li>If neither party confirms, the lesson is automatically expired and the reserved amount is refunded to the student.</li>
            <li>Disputes (one-sided confirmations, non-responsiveness) are flagged for admin review.</li>
            <li>ChessCoach reserves the right to resolve disputes at its sole discretion.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">8. Prohibited Conduct</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Creating multiple accounts or using shared payment methods to circumvent limits.</li>
            <li>Spamming lesson requests or abusing the request system.</li>
            <li>Harassing, threatening, or abusing other users.</li>
            <li>Attempting to bypass the Platform for off-platform payments to avoid fees.</li>
            <li>Using the Platform for any illegal purpose.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">9. Suspension &amp; Termination</h2>
          <p className="leading-relaxed">
            ChessCoach may suspend or permanently ban accounts that violate these Terms, engage in fraudulent activity, or are flagged by our abuse detection systems. Suspended users may contact <a href="mailto:chesscoach.training@gmail.com" className="underline">chesscoach.training@gmail.com</a> to appeal.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">10. Limitation of Liability</h2>
          <p className="leading-relaxed">
            ChessCoach is provided &quot;as is&quot; without warranty of any kind. To the fullest extent permitted by law, ChessCoach shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform, including but not limited to loss of data, revenue, or profits.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">11. Changes to Terms</h2>
          <p className="leading-relaxed">
            We may update these Terms at any time. Continued use of the Platform after changes constitutes acceptance. We will update the &quot;Last updated&quot; date at the top of this page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">12. Contact</h2>
          <p className="leading-relaxed">
            For questions about these Terms, contact us at{" "}
            <a href="mailto:chesscoach.training@gmail.com" className="underline">chesscoach.training@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
