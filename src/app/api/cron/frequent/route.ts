import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  sendLessonReminders,
  expirePendingRequests,
  detectNoShows,
} from "@/lib/activity";

// Called frequently (every ~15 min - see vercel.json) for time-sensitive work
// the once-a-day cron can't handle: lesson reminders that must land ~1 hour
// before the start, expiring short-fuse (instant / soon-starting) requests
// promptly so funds are released, and catching no-shows close to the scheduled
// time. All heavier daily housekeeping stays in /api/cron/daily.
//
// Runs as a native Vercel cron (vercel.json), which requires a plan that allows
// sub-daily schedules (Pro+). Vercel auto-sends the CRON_SECRET as a Bearer
// token, which the auth check below validates. The GitHub Action of the same
// name is now a manual-only fallback.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // allSettled so one failing task doesn't block the others. Named so a failure
  // report says *which* sweep broke.
  const named: [string, Promise<unknown>][] = [
    ["sendLessonReminders", sendLessonReminders()],
    ["expirePendingRequests", expirePendingRequests()],
    ["detectNoShows", detectNoShows()],
  ];
  const results = await Promise.allSettled(named.map(([, p]) => p));

  const failures: { task: string; error: string }[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const task = named[i][0];
      const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`Frequent cron task "${task}" failed:`, r.reason);
      // Report to Sentry so the failure is actually visible (console.error alone
      // never surfaced these, which is why the cron looked healthy while
      // reminders silently stopped). Tag with the sweep name for grouping.
      Sentry.captureException(r.reason, { tags: { cron: "frequent", task } });
      failures.push({ task, error });
    }
  });

  // Serverless can freeze before buffered Sentry events flush; force it.
  if (failures.length > 0) await Sentry.flush(2000);

  // 500 only if everything failed, so monitoring/the cron log goes red on a
  // total outage; partial failures still return 200 but list what broke.
  const allFailed = failures.length === named.length;
  return NextResponse.json(
    {
      success: failures.length === 0,
      timestamp: new Date().toISOString(),
      failures,
    },
    { status: allFailed ? 500 : 200 },
  );
}
