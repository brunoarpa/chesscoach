import type Stripe from "stripe";

let cachedCurrency: string | null = null;

/**
 * The currency the platform Stripe account settles in (e.g. "eur", "usd").
 *
 * Charges AND transfers must use this currency. Stripe holds your available
 * balance per-currency in the account's settlement currency, so transferring in
 * a different currency (e.g. hardcoded "usd" against a EUR account) fails with
 * `balance_insufficient` even when funds are available. Cached for the process
 * lifetime — an account's default currency never changes.
 */
export async function getPlatformCurrency(stripe: Stripe): Promise<string> {
  if (cachedCurrency) return cachedCurrency;
  const account = await stripe.accounts.retrieveCurrent();
  cachedCurrency = account.default_currency ?? "usd";
  return cachedCurrency;
}
