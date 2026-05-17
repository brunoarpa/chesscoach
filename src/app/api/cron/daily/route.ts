import { NextResponse } from "next/server";
import { recalculateAllElos } from "@/lib/elo";
import { updateActivityStatuses, expirePendingRequests, detectConfirmationDisputes, detectNoShows, autoCompleteLessons } from "@/lib/activity";
import { refreshAllChessComRatings } from "@/lib/chess-com";
import { prisma } from "@/lib/prisma";
import { generateUpcomingSlots } from "@/lib/actions/timeslots";

// This endpoint should be called daily by a cron job
// In Vercel, configure in vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 6 * * *" }] }
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use allSettled so one failing task doesn't block the others.
  const tasks = await Promise.allSettled([
    recalculateAllElos(),
    updateActivityStatuses(),
    expirePendingRequests(),
    refreshAllChessComRatings(),
    detectConfirmationDisputes(),
    detectNoShows(),
    autoCompleteLessons(),
    prisma.rateLimitEntry.deleteMany({ where: { resetAt: { lt: new Date() } } }),
  ]);

  let slotTasks: PromiseSettledResult<unknown>[] = [];
  try {
    const coachesWithTemplates = await prisma.timeSlotTemplate.findMany({
      select: { coachId: true },
      distinct: ["coachId"],
    });
    slotTasks = await Promise.allSettled(
      coachesWithTemplates.map((c) => generateUpcomingSlots(c.coachId))
    );
  } catch (error) {
    console.error("Cron slot generation failed:", error instanceof Error ? error.message : "Unknown error");
  }

  const failures = [...tasks, ...slotTasks].filter((t) => t.status === "rejected");
  for (const f of failures) {
    if (f.status === "rejected") {
      console.error("Cron task failed:", f.reason instanceof Error ? f.reason.message : f.reason);
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    failures: failures.length,
  });
}
