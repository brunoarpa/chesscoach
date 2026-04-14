import { NextResponse } from "next/server";
import { recalculateAllElos } from "@/lib/elo";
import { updateActivityStatuses, expirePendingRequests } from "@/lib/activity";
import { refreshAllChessComRatings } from "@/lib/chess-com";

// This endpoint should be called daily by a cron job
// In Vercel, configure in vercel.json: { "crons": [{ "path": "/api/cron/daily", "schedule": "0 6 * * *" }] }
export async function POST(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await Promise.all([
      recalculateAllElos(),
      updateActivityStatuses(),
      expirePendingRequests(),
      refreshAllChessComRatings(),
    ]);

    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Cron job failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
