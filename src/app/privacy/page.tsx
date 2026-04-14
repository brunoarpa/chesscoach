import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - ChessCoach",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">Last updated: April 14, 2026</p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">1. Information We Collect</h2>
          <p className="leading-relaxed mb-3">We collect the following types of information:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Account information:</strong> Username, email address (optional), and hashed password when you create an account.</li>
            <li><strong>Profile information:</strong> Chess.com username, biography, coaching preferences, and communication preferences that you provide.</li>
            <li><strong>Payment information:</strong> Processed and stored by Stripe. We store only a card fingerprint (a non-reversible token) and last 4 digits for fraud detection. We never see or store your full card number.</li>
            <li><strong>IP address:</strong> Collected at signup and during certain actions for rate limiting and fraud prevention.</li>
            <li><strong>Usage data:</strong> Lesson requests, reviews, transaction history, and activity timestamps needed to operate the Platform.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">2. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Provide the service:</strong> Match students with coaches, process payments, facilitate lesson requests and reviews.</li>
            <li><strong>Fraud prevention:</strong> Detect duplicate accounts, card sharing across accounts, abusive patterns such as excessive declined requests, and other prohibited conduct.</li>
            <li><strong>Rate limiting:</strong> Prevent abuse of signup, login, password reset, and lesson request features.</li>
            <li><strong>Communication:</strong> Send password reset emails if you provide an email address.</li>
            <li><strong>Platform improvement:</strong> Aggregate, anonymized analytics to understand usage patterns.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">3. Information Sharing</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Other users:</strong> Your username, profile information, coaching status, activity status, and reviews are visible to other users. Your email and IP address are never shared with other users.</li>
            <li><strong>Stripe:</strong> Payment data is shared with Stripe to process transactions. See <a href="https://stripe.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">Stripe&apos;s Privacy Policy</a>.</li>
            <li><strong>Chess.com:</strong> We query the Chess.com public API to verify your account and fetch your rating. We do not share your data with Chess.com.</li>
            <li><strong>Law enforcement:</strong> We may disclose information if required by law or to protect the rights, safety, or property of ChessCoach or its users.</li>
            <li>We do not sell your personal information to third parties.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">4. Data Retention</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Account data is retained as long as your account is active.</li>
            <li>Transaction and lesson history is retained for financial record-keeping and dispute resolution.</li>
            <li>Rate-limiting records are automatically purged daily after expiration.</li>
            <li>If you request account deletion, we will delete your personal data within 30 days, except where retention is required for legal or financial obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">5. Data Security</h2>
          <p className="leading-relaxed">
            We use industry-standard security measures including encrypted connections (HTTPS/TLS), hashed passwords (bcrypt), CSRF protection, and secure HTTP headers. Payment processing is handled entirely by Stripe, a PCI-DSS Level 1 certified provider. However, no system is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">6. Your Rights</h2>
          <p className="leading-relaxed mb-3">Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Access the personal data we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your account and personal data.</li>
            <li>Object to or restrict certain processing of your data.</li>
            <li>Export your data in a portable format.</li>
          </ul>
          <p className="leading-relaxed mt-3">
            To exercise these rights, contact us at{" "}
            <a href="mailto:chesscoach.training@gmail.com" className="underline">chesscoach.training@gmail.com</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">7. Cookies</h2>
          <p className="leading-relaxed">
            We use essential cookies only — specifically a session cookie for authentication. We do not use tracking cookies, advertising cookies, or third-party analytics cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">8. Children&apos;s Privacy</h2>
          <p className="leading-relaxed">
            The Platform is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has created an account, contact us and we will remove it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">9. Changes to This Policy</h2>
          <p className="leading-relaxed">
            We may update this Privacy Policy from time to time. We will update the &quot;Last updated&quot; date at the top. Continued use of the Platform after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mt-8 mb-3">10. Contact</h2>
          <p className="leading-relaxed">
            For privacy-related questions or requests, contact us at{" "}
            <a href="mailto:chesscoach.training@gmail.com" className="underline">chesscoach.training@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
