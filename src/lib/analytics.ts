import { sendGAEvent } from "@next/third-parties/google";

// Thin wrapper for GA4 funnel events. Safe to call anywhere on the client:
// when NEXT_PUBLIC_GA_ID is unset the gtag script never loads, so this just
// pushes to a dataLayer nobody reads - a harmless no-op. Analytics must never
// break a user flow, hence the try/catch.
//
// The funnel we track: sign_up -> booking_created -> lesson_paid -> review_left.
export function track(event: string, params: Record<string, unknown> = {}) {
  try {
    sendGAEvent("event", event, params);
  } catch {
    // ignore - never let analytics throw into a user action
  }
}
