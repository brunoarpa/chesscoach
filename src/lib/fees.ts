/**
 * Platform commission on completed lessons.
 *
 * The coach absorbs the fee: the student pays the full lesson price, the coach
 * receives `price − commission`, and the commission stays in the platform's
 * Stripe balance as revenue. A lesson payment is an internal ledger move (no
 * Stripe processing fee), so this commission is pure margin.
 *
 * Change PLATFORM_FEE_PERCENT to adjust the rate everywhere.
 */
export const PLATFORM_FEE_PERCENT = 0.1; // 10%

/** The platform's cut of a lesson price, in cents (rounded). */
export function platformCommission(priceCents: number): number {
  return Math.round(priceCents * PLATFORM_FEE_PERCENT);
}

/**
 * What the coach actually earns from a lesson, in cents: the price minus the
 * platform commission. Defined as the remainder so coachEarnings + commission
 * always sums back to the exact price (no rounding leakage).
 */
export function coachEarnings(priceCents: number): number {
  return priceCents - platformCommission(priceCents);
}

/**
 * Payment-processing fee applied to wallet deposits, in cents: a flat amount
 * plus a percentage, roughly covering Stripe's card-processing cost. Kept
 * slightly below Stripe's real rate on larger deposits on purpose — cheap
 * top-ups are demand-side acquisition, and the platform earns on commission.
 */
export const PROCESSING_FEE_FLAT_CENTS = 40; // $0.40
export const PROCESSING_FEE_PERCENT = 0.02; // 2%

export function processingFee(amountCents: number): number {
  return PROCESSING_FEE_FLAT_CENTS + Math.ceil(amountCents * PROCESSING_FEE_PERCENT);
}

/**
 * Coach withdrawal fees: a transparent pass-through of Stripe's real costs,
 * with no platform markup beyond a small rounding cushion.
 *
 * Stripe bills the platform two things for Express payouts:
 * - $2 per "monthly active account" — once per calendar month, only in months
 *   the coach receives at least one payout. Passed through on the coach's
 *   FIRST withdrawal of each month (`PAYOUT_MONTHLY_FEE_CENTS`); later
 *   withdrawals that month skip it.
 * - ~0.25% + $0.25 per transfer — covered by `payoutTransferFee` ($0.40 +
 *   0.5%).
 *
 * Because the cost is mostly fixed, the effective fee percentage falls the
 * more a coach withdraws at once — the intended incentive to batch payouts.
 */
// High enough that a payout always carries more commission than its Stripe
// costs, low enough that a new coach reaches it within a handful of lessons.
export const MIN_PAYOUT_CENTS = 2500; // $25.00

export const PAYOUT_MONTHLY_FEE_CENTS = 200; // $2.00, Stripe's monthly active-account fee
export const PAYOUT_TRANSFER_FEE_FLAT_CENTS = 40; // $0.40
export const PAYOUT_TRANSFER_FEE_PERCENT = 0.005; // 0.5%

export function payoutTransferFee(amountCents: number): number {
  return PAYOUT_TRANSFER_FEE_FLAT_CENTS + Math.ceil(amountCents * PAYOUT_TRANSFER_FEE_PERCENT);
}

/** Total withdrawal fee. `monthlyFeeDue` = no other payout yet this calendar month. */
export function payoutFee(amountCents: number, monthlyFeeDue: boolean): number {
  return payoutTransferFee(amountCents) + (monthlyFeeDue ? PAYOUT_MONTHLY_FEE_CENTS : 0);
}
