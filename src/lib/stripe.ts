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
