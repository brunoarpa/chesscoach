import { describe, it, expect } from "vitest";
import {
  payoutCommission,
  processingFee,
  payoutFee,
  PROCESSING_FEE_FLAT_CENTS,
  PAYOUT_BASE_FEE_CENTS,
  MIN_PAYOUT_CENTS,
} from "@/lib/fees";

describe("payoutCommission", () => {
  it("takes 5% of the withdrawal, rounded to the nearest cent", () => {
    expect(payoutCommission(10000)).toBe(500);
    expect(payoutCommission(2000)).toBe(100);
    expect(payoutCommission(0)).toBe(0);
  });

  it("rounds half up", () => {
    expect(payoutCommission(1010)).toBe(51); // 50.5 -> 51
    expect(payoutCommission(1000)).toBe(50);
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

describe("payoutFee", () => {
  it("is the flat Stripe base fee plus the platform commission", () => {
    expect(payoutFee(10000)).toBe(PAYOUT_BASE_FEE_CENTS + payoutCommission(10000));
    expect(payoutFee(2500)).toBe(PAYOUT_BASE_FEE_CENTS + payoutCommission(2500));
  });

  it("effective percentage falls as the withdrawal grows (batching incentive)", () => {
    const pct = (cents: number) => payoutFee(cents) / cents;
    expect(pct(5000)).toBeLessThan(pct(2500));
    expect(pct(30000)).toBeLessThan(pct(5000));
  });

  it("leaves a positive net at the minimum payout", () => {
    expect(payoutFee(MIN_PAYOUT_CENTS)).toBeLessThan(MIN_PAYOUT_CENTS);
  });
});
