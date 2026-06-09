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
 * Payment-processing fee applied to wallet deposits and coach withdrawals, in
 * cents: a flat amount plus a percentage of the transaction, covering the real
 * Stripe card/transfer costs. Used by both the deposit and withdraw endpoints
 * so the two stay in lockstep.
 */
export const PROCESSING_FEE_FLAT_CENTS = 40; // $0.40
export const PROCESSING_FEE_PERCENT = 0.02; // 2%

export function processingFee(amountCents: number): number {
  return PROCESSING_FEE_FLAT_CENTS + Math.ceil(amountCents * PROCESSING_FEE_PERCENT);
}
