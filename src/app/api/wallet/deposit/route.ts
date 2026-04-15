import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

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

  if (!amount || amount < 500) {
    return NextResponse.json({ error: "Minimum deposit is $5.00" }, { status: 400 });
  }

  if (amount > 1000000) {
    return NextResponse.json({ error: "Maximum deposit is $10,000.00" }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Payment processing is not configured" }, { status: 503 });
  }

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
          currency: "usd",
          product_data: { name: "ChessCoach Wallet Deposit" },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
      type: "deposit",
    },
    success_url: `${appUrl}/wallet?success=true`,
    cancel_url: `${appUrl}/wallet?cancelled=true`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
