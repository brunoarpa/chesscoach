import * as Sentry from "@sentry/nextjs";

// Client-side error monitoring. Inert unless NEXT_PUBLIC_SENTRY_DSN is set.
// The DSN is a public identifier (it can only ingest events), so exposing it
// in the bundle is fine.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
