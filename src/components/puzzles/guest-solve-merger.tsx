"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { mergeGuestSolves } from "@/lib/actions/puzzles";
import { readGuestSolves, clearGuestSolves } from "@/lib/puzzle-progress";

// Mounted on the puzzle pages for signed-in users only. If they solved puzzles as
// a guest and then signed up in the same session, this claims those solves for
// their new account on the next puzzle page they land on. Signup sends them back
// to /puzzles precisely so this runs.
export function GuestSolveMerger() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const pending = readGuestSolves();
    if (pending.length === 0) return;

    // Clear first: if the merge fails we would rather drop the guest progress
    // than retry forever on every navigation.
    clearGuestSolves();

    mergeGuestSolves(pending)
      .then((res) => {
        if (res.merged > 0) router.refresh();
      })
      .catch(() => {
        // Non-critical. The user keeps solving; nothing breaks.
      });
  }, [router]);

  return null;
}
