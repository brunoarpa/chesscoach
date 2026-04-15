"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 10_000; // 10 seconds

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
