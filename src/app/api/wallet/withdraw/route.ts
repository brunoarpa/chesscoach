import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const FEE_FLAT_CENTS = 40;      // €0.40
const FEE_PERCENT = 0.02;       // 2%
const MIN_PAYOUT_CENTS = 500;    // €5.00

function calculateFee(amountCents: number): number {
  return FEE_FLAT_CENTS + Math.ceil(amountCents * FEE_PERCENT);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Parse requested amount (in cents). Defaults to full pending balance when omitted.
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

  if (!process.env.STRIPE_SECRET_KEY) {
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
    return NextResponse.json({ error: `Minimum withdrawal is €${(MIN_PAYOUT_CENTS / 100).toFixed(2)}` }, { status: 400 });
  }

  const grossAmount = requestedCents ?? user.pendingEarnings;

  if (grossAmount > user.pendingEarnings) {
    return NextResponse.json({ error: "Amount exceeds your pending earnings" }, { status: 400 });
  }
  if (grossAmount < MIN_PAYOUT_CENTS) {
    return NextResponse.json({ error: `Minimum withdrawal is €${(MIN_PAYOUT_CENTS / 100).toFixed(2)}` }, { status: 400 });
  }

  // Verify Stripe Connect account is fully onboarded
  const stripe = (await import("stripe")).default;
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

  const account = await stripeClient.accounts.retrieve(user.stripeConnectAccountId);
  if (!account.charges_enabled || !account.payouts_enabled) {
    return NextResponse.json({ error: "Your payout account is not fully set up" }, { status: 400 });
  }

  const fee = calculateFee(grossAmount);
  const netAmount = grossAmount - fee;

  if (netAmount <= 0) {
    return NextResponse.json({ error: "Amount too low to cover the withdrawal fee" }, { status: 400 });
  }

  // Atomically reserve the withdrawal amount. If the guard fails, somebody else
  // (or a concurrent click) already drained the balance.
  const reserved = await prisma.user.updateMany({
    where: { id: session.user.id, pendingEarnings: { gte: grossAmount } },
    data: { pendingEarnings: { decrement: grossAmount } },
  });
  if (reserved.count === 0) {
    return NextResponse.json({ error: "Balance changed while processing. Please retry." }, { status: 409 });
  }

  // Idempotency key tied to user + amount + a fresh nonce, so a retried request
  // with the same payload doesn't double-pay if Stripe got our first call.
  const idempotencyKey = `wd_${session.user.id}_${grossAmount}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const transfer = await stripeClient.transfers.create(
      {
        amount: netAmount,
        currency: "eur",
        destination: user.stripeConnectAccountId,
      },
      { idempotencyKey },
    );

    const now = new Date();

    await prisma.$transaction([
      prisma.payout.create({
        data: {
          coachId: session.user.id,
          amount: grossAmount,
          status: "COMPLETED",
          stripeTransferId: transfer.id,
          periodStart: now,
          periodEnd: now,
        },
      }),
      prisma.transaction.create({
        data: {
          userId: session.user.id,
          type: "PAYOUT",
          amount: -grossAmount,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      gross: grossAmount,
      fee,
      net: netAmount,
    });
  } catch (error) {
    // Stripe transfer failed — credit the money back to the user.
    await prisma.user.update({
      where: { id: session.user.id },
      data: { pendingEarnings: { increment: grossAmount } },
    }).catch(() => {});
    console.error("Withdrawal failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Withdrawal failed. Please try again later." }, { status: 500 });
  }
}
