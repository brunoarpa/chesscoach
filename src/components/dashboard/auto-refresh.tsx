"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Each refresh re-runs the whole dashboard page on the server, so this
// interval is a direct multiplier on database load per parked user.
const REFRESH_INTERVAL_MS = 30_000; // 30 seconds

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router]);

  return null;
}
