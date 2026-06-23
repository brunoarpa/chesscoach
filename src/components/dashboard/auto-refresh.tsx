"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Each refresh re-runs the whole dashboard page on the server, so this interval
// is a direct multiplier on database/compute load per parked user. Keep it slow,
// and never refresh a tab that's hidden (backgrounded/minimized) - a parked tab
// would otherwise re-render the dashboard server-side forever. We refresh once
// when the user returns to the tab so they still see fresh data immediately.
const REFRESH_INTERVAL_MS = 120_000; // 2 minutes

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
