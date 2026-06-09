import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";

// POST: Create or retrieve a Stripe Connect onboarding link for coaches
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { success: rlSuccess } = await rateLimit(`connect:${session.user.id}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
  if (!rlSuccess) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const stripeClient = await getStripe();
  if (!stripeClient) {
    return NextResponse.json({ error: "Payment processing is not configured" }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      verificationStatus: true,
      coachChatPrice: true,
      coachCallPrice: true,
      stripeConnectAccountId: true,
      isSuspended: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.isSuspended) {
    return NextResponse.json({ error: "Your account is under review" }, { status: 403 });
  }

  // Anyone with a coaching price can set up payouts. chess.com verification is optional.
  if (!user.coachChatPrice && !user.coachCallPrice) {
    return NextResponse.json({ error: "Set your coaching prices before setting up payouts" }, { status: 400 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

  let accountId = user.stripeConnectAccountId;

  if (!accountId) {
    // Create a new Express Connect account
    const account = await stripeClient.accounts.create({
      type: "express",
      metadata: { userId: session.user.id },
    });
    accountId = account.id;

    await prisma.user.update({
      where: { id: session.user.id },
      data: { stripeConnectAccountId: accountId },
    });
  }

  // Check if already fully onboarded
  const account = await stripeClient.accounts.retrieve(accountId);
  if (account.charges_enabled && account.payouts_enabled) {
    return NextResponse.json({ alreadyOnboarded: true });
  }

  // Generate an onboarding link
  const accountLink = await stripeClient.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/wallet?connect=refresh`,
    return_url: `${appUrl}/wallet?connect=return`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}

// GET: Check Connect account status
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeConnectAccountId: true },
  });

  const stripeClient = await getStripe();
  if (!user?.stripeConnectAccountId || !stripeClient) {
    return NextResponse.json({ connected: false });
  }

  try {
    const account = await stripeClient.accounts.retrieve(user.stripeConnectAccountId);
    return NextResponse.json({
      connected: true,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
