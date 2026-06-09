/**
 * The single currency the whole app is denominated in. Every stored amount
 * (walletBalance, reservedBalance, pendingEarnings, coach prices, …) is in this
 * currency's minor units (cents), and all Stripe charges and transfers use it.
 *
 * USD is used because the marketplace is global (US / EU / India / …) and USD is
 * the universal denominator. The platform Stripe account must hold a balance in
 * this currency (add it under Settings → Balances → "Add settlement currency"),
 * otherwise transfers fail with `balance_insufficient`. Coaches in other
 * countries receive USD into their connected account; Stripe converts to their
 * local currency only when paying out to their bank, and the coach bears that
 * conversion — so the platform never takes on FX risk.
 *
 * NOTE: do NOT derive this from the account's `default_currency` — that's the
 * account's home/settlement currency (e.g. EUR for a Spanish account) and is not
 * the same as the currency the app operates in.
 */
export const APP_CURRENCY = "usd";

/**
 * Lazily construct a Stripe client from STRIPE_SECRET_KEY, or return null when
 * Stripe isn't configured. Centralizes the dynamic import and the
 * "is-Stripe-configured?" check that every Stripe-touching route needs, so the
 * client is built one consistent way. Callers decide how to respond to null
 * (the deposit/withdraw/connect routes return a 503; the webhook returns 500).
 */
export async function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = (await import("stripe")).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
