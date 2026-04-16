import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const PROCESSING_FEE_CENTS = 50; // €0.50 flat fee
const MIN_DEPOSIT_CENTS = 500;   // €5.00
const MAX_DEPOSIT_CENTS = 1000;  // €10.00

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
      { error: "Your account is under review. Contact support at chesscoach.training@gmail.com" },
      { status: 403 }
    );
  }

  const { amount } = await request.json();

  if (!amount || amount < MIN_DEPOSIT_CENTS) {
    return NextResponse.json({ error: "Minimum deposit is €5.00" }, { status: 400 });
  }

  if (amount > MAX_DEPOSIT_CENTS) {
    return NextResponse.json({ error: "Maximum deposit is €10.00" }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Payment processing is not configured" }, { status: 503 });
  }

  const totalCharge = amount + PROCESSING_FEE_CENTS;

  // Create a Stripe Checkout session
  const stripe = (await import("stripe")).default;
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

  const checkoutSession = await stripeClient.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: "ChessCoach Wallet Deposit" },
          unit_amount: amount,
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: "eur",
          product_data: { name: "Processing Fee" },
          unit_amount: PROCESSING_FEE_CENTS,
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
