import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/wallet?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/wallet?cancelled=true`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
