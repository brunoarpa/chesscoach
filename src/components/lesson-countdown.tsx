"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

// Room opens 5 minutes before the scheduled start — keep in sync with the
// EARLY_JOIN_MS used by the dashboards and the /lesson/[id] page guard.
const EARLY_JOIN_MS = 5 * 60 * 1000;

function formatRemaining(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 1) return `${minutes} min`;
  return "1 min";
}

/**
 * Live "Starts in 4h 12m" pill for an upcoming scheduled lesson, so people can
 * see at a glance how far off a lesson is without parsing the date. Escalates
 * as the start approaches: muted → amber under an hour → green pulse once the
 * room is joinable → red nudge if it already started and they're not in yet.
 * Renders nothing once the lesson's end time has passed.
 */
export function LessonCountdown({
  scheduledStartAt,
  scheduledEndAt,
}: {
  scheduledStartAt: string;
  scheduledEndAt: string | null;
}) {
  const start = new Date(scheduledStartAt).getTime();
  const end = scheduledEndAt ? new Date(scheduledEndAt).getTime() : null;

  const [now, setNow] = useState(() => Date.now());
  // Tick every second close to the start (so the last minutes count down
  // visibly), lazily otherwise. The server-rendered text can differ from the
  // client's by a tick, so the spans carry suppressHydrationWarning — same
  // pattern as <LocalTime>.
  useEffect(() => {
    const msToStart = start - Date.now();
    const intervalMs = msToStart > 0 && msToStart < 2 * 60 * 1000 ? 1_000 : 15_000;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [start, now]);

  if (end !== null && now > end) return null;

  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium";

  if (now >= start) {
    return (
      <span suppressHydrationWarning className={`${base} border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400`}>
        <Clock className="h-3 w-3" />
        Started {formatRemaining(now - start)} ago — join now!
      </span>
    );
  }

  if (now >= start - EARLY_JOIN_MS) {
    return (
      <span suppressHydrationWarning className={`${base} border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        Starting in {formatRemaining(start - now)} — you can join
      </span>
    );
  }

  const underAnHour = start - now < 60 * 60 * 1000;
  return (
    <span
      suppressHydrationWarning
      className={`${base} ${
        underAnHour
          ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          : "border-border bg-muted text-muted-foreground"
      }`}
    >
      <Clock className="h-3 w-3" />
      Starts in {formatRemaining(start - now)}
    </span>
  );
}
