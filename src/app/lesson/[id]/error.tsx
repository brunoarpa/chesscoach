"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function LessonError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Lesson page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground max-w-md">
        The lesson page encountered an error. This may be temporary - try
        again, or head back to your dashboard.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        {/* A plain link, not router.push: navigating fully out of the crashed
            route segment guarantees an escape even when re-rendering it would
            just crash again. Without this the lesson is a dead-end (only "Try
            again", which re-runs the same failing render). */}
        <Button asChild variant="outline">
          <a href="/dashboard">Return to dashboard</a>
        </Button>
      </div>
      {error.digest && (
        <p className="text-xs text-muted-foreground/70">
          Error reference: {error.digest}
        </p>
      )}
    </div>
  );
}
