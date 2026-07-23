import { sendGAEvent } from "@next/third-parties/google";

// Thin wrapper for GA4 funnel events. Safe to call anywhere on the client:
// when NEXT_PUBLIC_GA_ID is unset the gtag script never loads, so this just
// pushes to a dataLayer nobody reads - a harmless no-op. Analytics must never
// break a user flow, hence the try/catch.
//
// The funnel we track: sign_up -> booking_created -> lesson_paid -> review_left.
export function track(event: string, params: Record<string, unknown> = {}) {
  try {
    // A page-view/mount event (puzzle_start, coaches_browse, the login beacon,
    // ...) can fire during hydration, before GoogleAnalytics' afterInteractive
    // init script has created window.dataLayer - sendGAEvent would then drop it.
    // Seed the queue ourselves so the event is buffered; gtag drains this same
    // array when it loads. Harmless no-op when GA is disabled (nobody drains it).
    if (typeof window !== "undefined") {
      const w = window as Window & { dataLayer?: unknown[] };
      w.dataLayer = w.dataLayer || [];
    }
    sendGAEvent("event", event, params);
  } catch {
    // ignore - never let analytics throw into a user action
  }
}
