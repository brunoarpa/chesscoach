import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { APP_CURRENCY, getStripe } from "@/lib/stripe";
import { payoutFee, payoutCommission, PAYOUT_BASE_FEE_CENTS, MIN_PAYOUT_CENTS } from "@/lib/fees";
import { getHeldEarnings } from "@/lib/earnings";

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
    // ignore parse errors - fall back to full balance
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
      isSuspended: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Suspension freezes the account's money movement in BOTH directions while
  // under review - otherwise a flagged coach could drain disputed earnings to
  // their bank before an admin rules on the dispute.
  if (user.isSuspended) {
    return NextResponse.json(
      { error: "Your account is under review. Withdrawals are paused - use the contact form at /contact to appeal." },
      { status: 403 }
    );
  }

  if (!user.stripeConnectAccountId) {
    return NextResponse.json({ error: "Set up your payout account first" }, { status: 400 });
  }

  // Hold earnings tied to an unresolved student-no-show dispute so a later
  // reversal always has the funds to claw back (see getHeldEarnings).
  const heldCents = await getHeldEarnings(session.user.id);
  const availableEarnings = user.pendingEarnings - heldCents;

  if (availableEarnings < MIN_PAYOUT_CENTS) {
    if (heldCents > 0) {
      return NextResponse.json(
        { error: `$${(heldCents / 100).toFixed(2)} of your earnings is on hold pending a no-show dispute and can't be withdrawn until it's resolved.` },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: `Minimum withdrawal is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}` }, { status: 400 });
  }

  const grossAmount = requestedCents ?? availableEarnings;

  if (grossAmount > availableEarnings) {
    return NextResponse.json(
      {
        error: heldCents > 0
          ? `Amount exceeds your withdrawable earnings ($${(heldCents / 100).toFixed(2)} is on hold pending a no-show dispute).`
          : "Amount exceeds your pending earnings",
      },
      { status: 400 },
    );
  }
  if (grossAmount < MIN_PAYOUT_CENTS) {
    return NextResponse.json({ error: `Minimum withdrawal is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}` }, { status: 400 });
  }

  // Rate-limit only requests that passed validation, so a typo'd amount or an
  // unfinished payout setup doesn't burn the small attempt budget.
  const { success: rlSuccess } = await rateLimit(`withdraw:${session.user.id}`, { maxAttempts: 3, windowMs: 15 * 60 * 1000 });
  if (!rlSuccess) {
    return NextResponse.json({ error: "Too many withdrawal attempts. Please try again later." }, { status: 429 });
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

  // The wallet shows gross earnings; all deductions happen here, at withdrawal:
  // a flat base fee (pass-through of Stripe's payout costs) plus the platform
  // commission. The flat base is charged on every withdrawal, not month-gated.
  const fee = payoutFee(grossAmount);
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
    // we DO NOT refund pendingEarnings - the money already left. The Payout row
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
      commission: payoutCommission(grossAmount),
      baseFee: PAYOUT_BASE_FEE_CENTS,
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
        // Delete the specific PAYOUT transaction we just created - never others.
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
