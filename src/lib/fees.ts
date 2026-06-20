/**
 * Platform commission, taken at withdrawal.
 *
 * The wallet shows GROSS earnings - a completed lesson credits the coach the
 * full price the student paid, and nothing is deducted until the coach cashes
 * out. The platform's cut is then realised as a percentage of the amount
 * withdrawn, and stays in the platform's Stripe balance as revenue.
 *
 * Change PLATFORM_FEE_PERCENT to adjust the rate everywhere.
 */
export const PLATFORM_FEE_PERCENT = 0.05; // 5%

/** The platform's commission on a withdrawal, in cents (rounded). This is our margin. */
export function payoutCommission(amountCents: number): number {
  return Math.round(amountCents * PLATFORM_FEE_PERCENT);
}

/**
 * Payment-processing fee applied to wallet deposits, in cents: a flat amount
 * plus a percentage, roughly covering Stripe's card-processing cost. Kept
 * slightly below Stripe's real rate on larger deposits on purpose - cheap
 * top-ups are demand-side acquisition, and the platform earns on commission.
 */
export const PROCESSING_FEE_FLAT_CENTS = 40; // $0.40
export const PROCESSING_FEE_PERCENT = 0.02; // 2%

export function processingFee(amountCents: number): number {
  return PROCESSING_FEE_FLAT_CENTS + Math.ceil(amountCents * PROCESSING_FEE_PERCENT);
}

/**
 * Coach withdrawal fees. Both parts are taken at withdrawal - the wallet shows
 * gross, so this is the only place money is deducted.
 *
 * 1. A flat base fee per withdrawal (`PAYOUT_BASE_FEE_CENTS`). This is a
 *    pass-through of Stripe's payout costs - its $2/month active-account fee
 *    plus its ~$0.25 + 0.25% per-transfer fee - bundled into one flat charge
 *    the coach sees as a "Stripe payout fee". Charged on every withdrawal (not
 *    month-gated): a flat base means the platform always covers Stripe no
 *    matter how small the withdrawal, which is what lets the minimum stay low.
 *    Withdrawing larger amounts less often spreads it thinner.
 * 2. The platform commission (`payoutCommission`) - our actual margin.
 *
 * The effective percentage therefore falls the more a coach withdraws at once,
 * the intended incentive to batch payouts.
 */
// Covers Stripe's $2/month active-account fee + its ~$0.25 + 0.25% per transfer.
export const PAYOUT_BASE_FEE_CENTS = 250; // $2.50

// Low on purpose: the flat base fee already covers Stripe at any size, so the
// minimum only exists to stop the fee from exceeding a tiny withdrawal.
export const MIN_PAYOUT_CENTS = 500; // $5.00

/** Total amount deducted from a withdrawal: the flat Stripe base fee + the platform commission. */
export function payoutFee(amountCents: number): number {
  return PAYOUT_BASE_FEE_CENTS + payoutCommission(amountCents);
}
