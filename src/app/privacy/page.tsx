import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - EloChaser",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">Last updated: May 16, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-6 mb-3">1. What We Collect</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Account:</strong> Username, email, and a hashed password.</li>
            <li><strong>Profile:</strong> Bio, timezone, languages, coaching prices, and (for coaches) a verified chess.com username.</li>
            <li><strong>Payments:</strong> Card data is handled by Stripe. We only store a non-reversible card fingerprint and the last 4 digits for fraud prevention.</li>
            <li><strong>IP address:</strong> Captured at signup and key actions for rate-limiting and abuse detection.</li>
            <li><strong>Usage:</strong> Lesson requests, reviews, transactions, and activity timestamps required to operate the Platform.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">2. How We Use It</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Service:</strong> Match students with coaches, process payments, manage bookings and reviews.</li>
            <li><strong>Abuse prevention:</strong> Detect duplicate accounts, card sharing, spam, and no-shows.</li>
            <li><strong>Rate limiting:</strong> Protect signup, login, password reset, deposits, and booking endpoints.</li>
            <li><strong>Communication:</strong> Send email verification, password reset, and dispute-related emails to the address on your account.</li>
            <li><strong>Improvement:</strong> Aggregate, anonymized analytics only.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">3. Sharing</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Other users:</strong> Your username, profile, coaching status, activity, and reviews are public. Your email and IP are not.</li>
            <li><strong>Stripe:</strong> Payment data is shared with Stripe. See <a href="https://stripe.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">Stripe&apos;s Privacy Policy</a>.</li>
            <li><strong>Chess.com:</strong> We query the public chess.com API to verify coach accounts and fetch ratings. We do not share your data with chess.com.</li>
            <li><strong>Google (optional):</strong> If you sign in with Google, your browser is redirected to Google&apos;s sign-in page (which sets its own cookies on google.com) and Google returns your name and email address to us. See <a href="https://policies.google.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">Google&apos;s Privacy Policy</a>.</li>
            <li><strong>Law enforcement:</strong> We may disclose information if required by law.</li>
            <li>We do not sell personal data.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">4. Retention</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Account data is retained while your account is active.</li>
            <li>Transaction and lesson history is retained for financial record-keeping and dispute resolution.</li>
            <li>Rate-limit records are automatically purged once expired.</li>
            <li>On request, we delete personal data within 30 days, except records required by legal or financial obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">5. Security</h2>
          <p className="leading-relaxed">
            We use HTTPS/TLS, hashed passwords (bcrypt), CSRF protection, and secure HTTP headers. Card processing is delegated to Stripe (PCI-DSS Level 1). No system is 100% secure; we make no guarantees of absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">6. Your Rights</h2>
          <p className="leading-relaxed mb-3">Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Access the personal data we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your account and personal data.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Export your data in a portable format.</li>
          </ul>
          <p className="leading-relaxed mt-3">
            To exercise these rights, reach us through the{" "}
            <Link href="/contact" className="underline">contact form</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">7. Cookies</h2>
          <p className="leading-relaxed">
            We use essential cookies only - a session cookie for authentication and CSRF protection. No tracking, advertising, or third-party analytics cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">8. Children</h2>
          <p className="leading-relaxed">
            The Platform is not intended for children under 13. If you believe a child under 13 has created an account, contact us and we will remove it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">9. Changes</h2>
          <p className="leading-relaxed">
            We may update this Policy from time to time. The &quot;Last updated&quot; date above will be revised. Continued use of the Platform constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">10. Contact</h2>
          <p className="leading-relaxed">
            Privacy questions? Reach us through the{" "}
            <Link href="/contact" className="underline">contact form</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
