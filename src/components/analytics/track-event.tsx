"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

// Fire-once GA4 beacon for server-rendered pages. Drop it into a server
// component (coaches list, a coach profile, the dashboard after login) and it
// sends a single `event` on mount - the server has no client hook to fire from,
// so this thin client child does it. `cleanupParam` strips a one-shot query
// flag (e.g. ?login=1) from the URL afterwards so a refresh doesn't re-fire.
export function TrackEvent({
  event,
  params,
  cleanupParam,
}: {
  event: string;
  params?: Record<string, unknown>;
  cleanupParam?: string;
}) {
  useEffect(() => {
    track(event, params ?? {});
    if (cleanupParam && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has(cleanupParam)) {
        url.searchParams.delete(cleanupParam);
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    }
    // Fire exactly once when the page mounts; params are read at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
