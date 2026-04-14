import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Monthly payout cron - transfer pending earnings to coaches
// Configure in Vercel: { "crons": [{ "path": "/api/cron/monthly-payout", "schedule": "0 0 1 * *" }] }
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const coaches = await prisma.user.findMany({
      where: { pendingEarnings: { gt: 0 } },
      select: { id: true, pendingEarnings: true, stripeConnectAccountId: true },
    });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    for (const coach of coaches) {
      // If Stripe Connect is set up, transfer funds
      if (process.env.STRIPE_SECRET_KEY && coach.stripeConnectAccountId) {
        try {
          const stripe = (await import("stripe")).default;
          const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

          const transfer = await stripeClient.transfers.create({
            amount: coach.pendingEarnings,
            currency: "usd",
            destination: coach.stripeConnectAccountId,
          });

          await prisma.$transaction([
            prisma.payout.create({
              data: {
                coachId: coach.id,
                amount: coach.pendingEarnings,
                status: "COMPLETED",
                stripeTransferId: transfer.id,
                periodStart,
                periodEnd,
              },
            }),
            prisma.transaction.create({
              data: {
                userId: coach.id,
                type: "PAYOUT",
                amount: -coach.pendingEarnings,
              },
            }),
            prisma.user.update({
              where: { id: coach.id },
              data: { pendingEarnings: 0 },
            }),
          ]);
        } catch (error) {
          console.error(`Payout failed for coach ${coach.id}:`, error instanceof Error ? error.message : "Unknown error");
          await prisma.payout.create({
            data: {
              coachId: coach.id,
              amount: coach.pendingEarnings,
              status: "FAILED",
              periodStart,
              periodEnd,
            },
          });
        }
      } else {
        // Record pending payout (no Stripe Connect)
        await prisma.payout.create({
          data: {
            coachId: coach.id,
            amount: coach.pendingEarnings,
            status: "PENDING",
            periodStart,
            periodEnd,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      coachesProcessed: coaches.length,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Monthly payout failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Payout failed" }, { status: 500 });
  }
}
