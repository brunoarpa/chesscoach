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
        refreshing.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
