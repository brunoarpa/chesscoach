import { describe, it, expect } from "vitest";
import {
  platformCommission,
  coachEarnings,
  processingFee,
  payoutTransferFee,
  payoutFee,
  PROCESSING_FEE_FLAT_CENTS,
  PAYOUT_MONTHLY_FEE_CENTS,
  MIN_PAYOUT_CENTS,
} from "@/lib/fees";

describe("platformCommission", () => {
  it("takes 10% of the price, rounded to the nearest cent", () => {
    expect(platformCommission(1500)).toBe(150);
    expect(platformCommission(1000)).toBe(100);
    expect(platformCommission(0)).toBe(0);
  });

  it("rounds half up", () => {
    expect(platformCommission(1505)).toBe(151); // 150.5 -> 151
    expect(platformCommission(1504)).toBe(150); // 150.4 -> 150
  });
});

describe("coachEarnings", () => {
  it("is the price minus the platform commission", () => {
    expect(coachEarnings(1500)).toBe(1350);
    expect(coachEarnings(1000)).toBe(900);
  });

  it("always sums back to the exact price (no rounding leakage)", () => {
    for (const price of [0, 1, 99, 100, 333, 500, 1505, 1999, 2000, 12345]) {
      expect(coachEarnings(price) + platformCommission(price)).toBe(price);
    }
  });

  it("never leaves the coach with more than the price or less than zero", () => {
    for (const price of [0, 1, 500, 2000, 99999]) {
      expect(coachEarnings(price)).toBeGreaterThanOrEqual(0);
      expect(coachEarnings(price)).toBeLessThanOrEqual(price);
    }
  });
});

describe("processingFee", () => {
  it("is a flat fee plus 2% of the amount, rounded up", () => {
    expect(processingFee(500)).toBe(PROCESSING_FEE_FLAT_CENTS + 10); // 40 + ceil(10) = 50
    expect(processingFee(2000)).toBe(PROCESSING_FEE_FLAT_CENTS + 40); // 40 + ceil(40) = 80
  });

  it("rounds the percentage component up to the next cent", () => {
    expect(processingFee(501)).toBe(PROCESSING_FEE_FLAT_CENTS + 11); // ceil(10.02) = 11
  });

  it("leaves a positive net for the smallest allowed amounts", () => {
    // Deposit minimum is $5.00; the fee must not exceed it.
    expect(processingFee(500)).toBeLessThan(500);
  });
});

describe("payout fees", () => {
  it("transfer fee is $0.40 + 0.5%, rounded up", () => {
    expect(payoutTransferFee(2500)).toBe(40 + 13); // ceil(12.5) = 13
    expect(payoutTransferFee(10000)).toBe(40 + 50);
  });

  it("adds the $2 Stripe monthly fee only when due", () => {
    expect(payoutFee(10000, true)).toBe(payoutTransferFee(10000) + PAYOUT_MONTHLY_FEE_CENTS);
    expect(payoutFee(10000, false)).toBe(payoutTransferFee(10000));
  });

  it("effective percentage falls as the withdrawal grows (batching incentive)", () => {
    const pct = (cents: number) => payoutFee(cents, true) / cents;
    expect(pct(5000)).toBeLessThan(pct(2500));
    expect(pct(30000)).toBeLessThan(pct(5000));
  });

  it("leaves a positive net at the minimum payout, even with the monthly fee", () => {
    expect(payoutFee(MIN_PAYOUT_CENTS, true)).toBeLessThan(MIN_PAYOUT_CENTS);
  });
});
