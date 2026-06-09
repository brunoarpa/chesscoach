import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Always evaluate at request time — a health check must never be cached.
export const dynamic = "force-dynamic";

// Liveness/readiness probe for uptime monitors and load balancers. Public by
// design (monitors can't authenticate) and returns no sensitive data. Verifies
// the database is reachable with a trivial query; 503 if it isn't, so a monitor
// can alert before users notice.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
