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
    const session = event.data.object as { metadata?: { userId?: string; type?: string }; amount_total?: number | null; payment_intent?: string; id?: string };
    const userId = session.metadata?.userId;
    const type = session.metadata?.type;
    const amount = session.amount_total;
    const paymentIntentId = session.payment_intent as string;

    if (userId && type === "deposit" && amount && paymentIntentId) {
      // Idempotency: check if this payment was already processed
      const existing = await prisma.transaction.findFirst({
        where: { stripePaymentIntentId: paymentIntentId },
      });
      if (existing) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      // Verify the user exists
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 400 });
      }

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
            stripePaymentIntentId: paymentIntentId,
          },
        }),
      ]);
    }
  }

  return NextResponse.json({ received: true });
}
