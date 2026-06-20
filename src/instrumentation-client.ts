import * as Sentry from "@sentry/nextjs";

// Client-side error monitoring. Inert unless NEXT_PUBLIC_SENTRY_DSN is set.
// The DSN is a public identifier (it can only ingest events), so exposing it
// in the bundle is fine.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Transient client-side fetch failures - dropped wifi, a backgrounded
    // tab, or navigating away mid-request. The app already tolerates these
    // (board/chat fetches are best-effort), so they're noise, not bugs.
    ignoreErrors: [
      "TypeError: network error",
      "TypeError: Failed to fetch",
      "TypeError: Load failed",
      "TypeError: cancelled",
      "NetworkError when attempting to fetch resource",
      "AbortError",
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
