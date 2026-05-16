"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const STORAGE_KEY = "coachInviteDismissed";

export function CoachInviteBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function handleDismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div className="mb-6 p-4 rounded-lg border bg-muted/40 flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="font-medium">Want to teach chess?</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Verify your chess.com account, set a price, and pick your languages to start receiving lesson requests.
        </p>
        <div className="mt-3">
          <Link href="/profile/edit?coach=1">
            <Button size="sm">Set up as a coach</Button>
          </Link>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
