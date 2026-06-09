import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { APP_CURRENCY, getStripe } from "@/lib/stripe";
import { processingFee } from "@/lib/fees";

const MIN_PAYOUT_CENTS = 500;    // $5.00

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let requestedCents: number | null = null;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body.amountCents === "number") {
      if (!Number.isFinite(body.amountCents) || body.amountCents <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      requestedCents = Math.floor(body.amountCents);
    }
  } catch {
    // ignore parse errors — fall back to full balance
  }

  const { success: rlSuccess } = await rateLimit(`withdraw:${session.user.id}`, { maxAttempts: 3, windowMs: 15 * 60 * 1000 });
  if (!rlSuccess) {
    return NextResponse.json({ error: "Too many withdrawal attempts. Please try again later." }, { status: 429 });
  }

  const stripeClient = await getStripe();
  if (!stripeClient) {
    return NextResponse.json({ error: "Payment processing is not configured" }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      pendingEarnings: true,
      stripeConnectAccountId: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.stripeConnectAccountId) {
    return NextResponse.json({ error: "Set up your payout account first" }, { status: 400 });
  }

  if (user.pendingEarnings < MIN_PAYOUT_CENTS) {
    return NextResponse.json({ error: `Minimum withdrawal is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}` }, { status: 400 });
  }

  const grossAmount = requestedCents ?? user.pendingEarnings;

  if (grossAmount > user.pendingEarnings) {
    return NextResponse.json({ error: "Amount exceeds your pending earnings" }, { status: 400 });
  }
  if (grossAmount < MIN_PAYOUT_CENTS) {
    return NextResponse.json({ error: `Minimum withdrawal is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}` }, { status: 400 });
  }

  // transfers.create only requires payouts_enabled on the destination account.
  // Transfer in the app currency (USD). Stripe holds the available balance
  // per-currency; the platform's USD balance funds this. Coaches whose bank is in
  // another currency receive USD into their connected account and Stripe converts
  // at their bank payout.
  const currency = APP_CURRENCY;

  const account = await stripeClient.accounts.retrieve(user.stripeConnectAccountId);
  if (!account.payouts_enabled) {
    return NextResponse.json({ error: "Your payout account is not fully set up" }, { status: 400 });
  }

  const fee = processingFee(grossAmount);
  const netAmount = grossAmount - fee;

  if (netAmount <= 0) {
    return NextResponse.json({ error: "Amount too low to cover the withdrawal fee" }, { status: 400 });
  }

  // Atomically: guard pendingEarnings, decrement it, and create a PENDING Payout
  // row + Transaction record in the same DB transaction. If the Stripe transfer
  // later fails, we revert this. If it succeeds, we flip Payout to COMPLETED.
  let payoutId: string;
  let transactionId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const reserved = await tx.user.updateMany({
        where: { id: session.user.id, pendingEarnings: { gte: grossAmount } },
        data: { pendingEarnings: { decrement: grossAmount } },
      });
      if (reserved.count === 0) {
        throw new Error("BALANCE_CHANGED");
      }
      const payout = await tx.payout.create({
        data: {
          coachId: session.user.id,
          amount: grossAmount,
          status: "PENDING",
          periodStart: new Date(),
          periodEnd: new Date(),
        },
      });
      const txn = await tx.transaction.create({
        data: {
          userId: session.user.id,
          type: "PAYOUT",
          amount: -grossAmount,
        },
      });
      return { payoutId: payout.id, transactionId: txn.id };
    });
    payoutId = result.payoutId;
    transactionId = result.transactionId;
  } catch (e) {
    if (e instanceof Error && e.message === "BALANCE_CHANGED") {
      return NextResponse.json({ error: "Balance changed while processing. Please retry." }, { status: 409 });
    }
    throw e;
  }

  // Stripe transfer. Idempotency key is tied to the Payout row, so a retry
  // with the same Payout never double-pays.
  try {
    const transfer = await stripeClient.transfers.create(
      {
        amount: netAmount,
        currency,
        destination: user.stripeConnectAccountId,
      },
      { idempotencyKey: `payout_${payoutId}` },
    );

    // Stripe transfer succeeded. Mark Payout COMPLETED. If this DB write fails,
    // we DO NOT refund pendingEarnings — the money already left. The Payout row
    // stays PENDING for manual reconciliation by an admin.
    try {
      await prisma.payout.update({
        where: { id: payoutId },
        data: { status: "COMPLETED", stripeTransferId: transfer.id },
      });
    } catch (dbError) {
      console.error(
        `CRITICAL: Stripe transfer ${transfer.id} succeeded but failed to mark Payout ${payoutId} as COMPLETED. Manual reconciliation required.`,
        dbError,
      );
    }

    return NextResponse.json({
      success: true,
      gross: grossAmount,
      fee,
      net: netAmount,
    });
  } catch (error) {
    // Stripe transfer failed. Revert: refund pendingEarnings and mark Payout FAILED.
    const stripeError = error as { code?: string; type?: string; message?: string };
    const isBalanceInsufficient = stripeError?.code === "balance_insufficient";

    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: session.user.id },
          data: { pendingEarnings: { increment: grossAmount } },
        }),
        prisma.payout.update({
          where: { id: payoutId },
          data: { status: "FAILED" },
        }),
        // Delete the specific PAYOUT transaction we just created — never others.
        prisma.transaction.delete({ where: { id: transactionId } }),
      ]);
    } catch (revertError) {
      console.error(
        `CRITICAL: Stripe transfer failed AND revert failed for Payout ${payoutId}. Manual reconciliation required.`,
        revertError,
      );
    }

    console.error("Withdrawal failed:", stripeError?.message ?? "Unknown error");

    if (isBalanceInsufficient) {
      return NextResponse.json(
        {
          error: "Withdrawals are temporarily unavailable while pending deposits settle. Please try again in 1-2 business days.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Withdrawal failed. Please try again later." }, { status: 500 });
  }
}
