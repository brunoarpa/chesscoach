import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripeClient = await getStripe();
  if (!stripeClient || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

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
    const session = event.data.object as { metadata?: { userId?: string; type?: string; depositAmount?: string }; amount_total?: number | null; payment_intent?: string; id?: string };
    const userId = session.metadata?.userId;
    const type = session.metadata?.type;
    // Use depositAmount from metadata (excludes processing fee), fall back to amount_total for older sessions
    const amount = session.metadata?.depositAmount ? parseInt(session.metadata.depositAmount, 10) : session.amount_total;
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

      // Extract card fingerprint for multi-account detection
      let cardFingerprint: string | null = null;
      let cardLast4: string | null = null;
      let cardBrand: string | null = null;
      try {
        const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.payment_method && typeof paymentIntent.payment_method === "string") {
          const pm = await stripeClient.paymentMethods.retrieve(paymentIntent.payment_method);
          cardFingerprint = pm.card?.fingerprint ?? null;
          cardLast4 = pm.card?.last4 ?? null;
          cardBrand = pm.card?.brand ?? null;
        }
      } catch {
        // Non-critical: continue even if fingerprint extraction fails
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

      // Store card fingerprint and check for duplicates (outside main transaction)
      if (cardFingerprint) {
        // Upsert the fingerprint record for this user
        await prisma.cardFingerprint.upsert({
          where: {
            fingerprint_userId: { fingerprint: cardFingerprint, userId },
          },
          create: {
            fingerprint: cardFingerprint,
            userId,
            last4: cardLast4,
            brand: cardBrand,
          },
          update: {}, // already exists, no update needed
        });

        // Check if this card is linked to a different account
        const otherAccounts = await prisma.cardFingerprint.findMany({
          where: {
            fingerprint: cardFingerprint,
            userId: { not: userId },
          },
          select: { userId: true },
        });

        if (otherAccounts.length > 0) {
          // Check if both accounts used free trials - higher severity
          const otherUserIds = otherAccounts.map((a) => a.userId);
          const [thisUser, otherUsers] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: { freeTrialsRemaining: true } }),
            prisma.user.findMany({
              where: { id: { in: otherUserIds } },
              select: { id: true, username: true, freeTrialsRemaining: true },
            }),
          ]);

          const thisUsedTrials = (thisUser?.freeTrialsRemaining ?? 3) < 3;
          const otherUsedTrials = otherUsers.some((u) => u.freeTrialsRemaining < 3);
          const bothUsedTrials = thisUsedTrials && otherUsedTrials;

          for (const other of otherAccounts) {
            // Flag both users
            const details = `Card *${cardLast4 ?? "????"} (${cardBrand ?? "unknown"}) shared between accounts.${bothUsedTrials ? " Both accounts have used free trials." : ""}`;
            const severity = bothUsedTrials ? "HIGH" : "MEDIUM";
            const flagType = bothUsedTrials ? "MULTI_ACCOUNT_SUSPECTED" : "DUPLICATE_CARD";

            // Flag on current user
            await prisma.abuseFlag.create({
              data: {
                userId,
                type: flagType,
                severity,
                details,
                relatedUserId: other.userId,
              },
            });

            // Flag on other user
            await prisma.abuseFlag.create({
              data: {
                userId: other.userId,
                type: flagType,
                severity,
                details,
                relatedUserId: userId,
              },
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
