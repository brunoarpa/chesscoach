/**
 * Read-only Stripe diagnostic: prints the platform account's country/currency
 * and its available vs pending balance per currency. Helps explain
 * `balance_insufficient` transfer errors.
 *
 *   npx tsx prisma/stripe-balance.ts
 */
import "dotenv/config";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY not set");
    process.exit(1);
  }
  console.log(`Mode: ${key.startsWith("sk_live") ? "LIVE" : "TEST"}`);

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);

  const account = await stripe.accounts.retrieve();
  console.log(`Platform account: ${account.id}`);
  console.log(`  country: ${account.country}`);
  console.log(`  default_currency: ${account.default_currency}`);

  const balance = await stripe.balance.retrieve();
  const show = (label: string, items: { amount: number; currency: string }[]) => {
    if (!items.length) {
      console.log(`  ${label}: (none)`);
      return;
    }
    for (const b of items) {
      console.log(`  ${label}: ${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`);
    }
  };
  console.log("Platform balance:");
  show("available", balance.available);
  show("pending", balance.pending);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
