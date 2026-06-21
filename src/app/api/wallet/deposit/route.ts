import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { APP_CURRENCY, getStripe } from "@/lib/stripe";
import { processingFee } from "@/lib/fees";

const MIN_DEPOSIT_CENTS = 500;    // $5.00
// Matches the max coach price ($200 / 30-min slot) so a student can fund any
// single lesson in one deposit instead of paying the flat fee on many $20
// top-ups. Still a per-deposit ceiling that caps exposure on any one charge.
const MAX_DEPOSIT_CENTS = 20000;  // $200.00

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit: max 10 deposit attempts per 15 minutes per user
  const { success: rlSuccess } = await rateLimit(`deposit:${session.user.id}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
  if (!rlSuccess) {
    return NextResponse.json({ error: "Too many deposit attempts. Please try again later." }, { status: 429 });
  }

  // Check suspension
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuspended: true },
  });
  if (user?.isSuspended) {
    return NextResponse.json(
      { error: "Your account is under review. Use the contact form at /contact to appeal." },
      { status: 403 }
    );
  }

  const { amount } = await request.json();

  if (typeof amount !== "number" || !Number.isInteger(amount)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  if (amount < MIN_DEPOSIT_CENTS) {
    return NextResponse.json({ error: `Minimum deposit is $${(MIN_DEPOSIT_CENTS / 100).toFixed(2)}` }, { status: 400 });
  }

  if (amount > MAX_DEPOSIT_CENTS) {
    return NextResponse.json({ error: `Maximum deposit is $${(MAX_DEPOSIT_CENTS / 100).toFixed(2)}` }, { status: 400 });
  }

  const stripeClient = await getStripe();
  if (!stripeClient) {
    return NextResponse.json({ error: "Payment processing is not configured" }, { status: 503 });
  }

  const feeCents = processingFee(amount);

  // Stripe Checkout requires absolute success/cancel URLs. If the app URL is
  // missing we'd build relative ones and the session creation would throw a
  // 500 - fail fast with a clear message instead.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (!appUrl) {
    console.error("NEXT_PUBLIC_APP_URL is not set - cannot build Stripe Checkout return URLs");
    return NextResponse.json({ error: "Payment processing is not configured" }, { status: 503 });
  }

  // Charge in the app currency (USD). The platform holds a USD balance, so these
  // settle as USD and are withdrawable in USD.
  const currency = APP_CURRENCY;

  const checkoutSession = await stripeClient.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: "EloChaser Wallet Deposit" },
          unit_amount: amount,
        },
        quantity: 1,
      },
      {
        price_data: {
          currency,
          product_data: { name: "Processing Fee" },
          unit_amount: feeCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
      type: "deposit",
      depositAmount: String(amount),
    },
    success_url: `${appUrl}/wallet?success=true`,
    cancel_url: `${appUrl}/wallet?cancelled=true`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
