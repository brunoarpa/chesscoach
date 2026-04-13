import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const stripe = (await import("stripe")).default;
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

  const body = await request.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripeClient.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: { userId?: string; type?: string }; amount_total?: number | null; payment_intent?: string };
    const userId = session.metadata?.userId;
    const type = session.metadata?.type;
    const amount = session.amount_total;

    if (userId && type === "deposit" && amount) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { walletBalance: { increment: amount } },
        }),
        prisma.transaction.create({
          data: {
            userId,
            type: "DEPOSIT",
            amount,
            stripePaymentIntentId: session.payment_intent as string,
          },
        }),
      ]);
    }
  }

  return NextResponse.json({ received: true });
}
