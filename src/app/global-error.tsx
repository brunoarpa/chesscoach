"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort error boundary: catches render crashes in the root layout that
// no nested error.tsx handles, reports them to Sentry, and shows a fallback
// instead of a blank page. Must render its own <html>/<body> because it
// replaces the root layout. Kept dependency-free (no ui components) since the
// app shell itself may be what crashed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <h2>Something went wrong</h2>
          <p>The error has been reported. Try refreshing the page.</p>
          <button onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1.25rem", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
