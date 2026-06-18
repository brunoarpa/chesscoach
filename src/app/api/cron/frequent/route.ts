import { NextResponse } from "next/server";
import {
  sendLessonReminders,
  expirePendingRequests,
  detectNoShows,
} from "@/lib/activity";

// Called frequently (every ~15 min — see vercel.json) for time-sensitive work
// the once-a-day cron can't handle: lesson reminders that must land ~1 hour
// before the start, expiring short-fuse (instant / soon-starting) requests
// promptly so funds are released, and catching no-shows close to the scheduled
// time. All heavier daily housekeeping stays in /api/cron/daily.
//
// NOTE: a sub-daily schedule requires a Vercel plan that supports it; on the
// Hobby tier crons only fire once a day regardless of the schedule string.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // allSettled so one failing task doesn't block the others.
  const tasks = await Promise.allSettled([
    sendLessonReminders(),
    expirePendingRequests(),
    detectNoShows(),
  ]);

  const failures = tasks.filter((t) => t.status === "rejected");
  for (const f of failures) {
    if (f.status === "rejected") {
      console.error("Frequent cron task failed:", f.reason instanceof Error ? f.reason.message : f.reason);
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    failures: failures.length,
  });
}
