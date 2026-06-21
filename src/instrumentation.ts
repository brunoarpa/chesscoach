import * as Sentry from "@sentry/nextjs";

// Server-side error monitoring. Inert unless SENTRY_DSN is set, so local dev
// and preview builds run exactly as before until the env var exists.
//
// captureConsoleIntegration forwards console.error to Sentry - that is what
// surfaces the withdraw route's "CRITICAL:" reconciliation logs (Stripe
// transfer succeeded but the DB write failed), which would otherwise be
// invisible in production. Alert rules on "CRITICAL:" live in the Sentry UI.
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Node runtime warnings (emitted on every serverless cold start) get
    // picked up by the console capture below - they're platform noise, not
    // app errors, and would otherwise burn alert attention and event quota.
    //
    // CredentialsSignin covers the normal failed-login path - Auth.js logs a
    // console.error whenever authorize() throws (wrong password, unverified
    // email, rate-limited), which the console capture below would otherwise
    // forward as an alert. A genuine fault inside authorize (DB/bcrypt) logs a
    // different error name and still comes through.
    ignoreErrors: [/ExperimentalWarning/, /DeprecationWarning/, /CredentialsSignin/],
    integrations:
      process.env.NEXT_RUNTIME === "nodejs"
        ? [Sentry.captureConsoleIntegration({ levels: ["error"] })]
        : [],
  });
}

export const onRequestError = Sentry.captureRequestError;
