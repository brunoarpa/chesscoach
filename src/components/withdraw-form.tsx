"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const FEE_FLAT_CENTS = 40;
const FEE_PERCENT = 0.02;
const MIN_PAYOUT_CENTS = 500;

function calculateFeeCents(amountCents: number): number {
  return FEE_FLAT_CENTS + Math.ceil(amountCents * FEE_PERCENT);
}

export function WithdrawForm({ pendingEarnings }: { pendingEarnings: number }) {
  const [loading, setLoading] = useState(false);
  const [amountStr, setAmountStr] = useState("");
  const [connectStatus, setConnectStatus] = useState<{
    connected: boolean;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/stripe/connect")
      .then((res) => res.json())
      .then(setConnectStatus)
      .catch(() => setConnectStatus({ connected: false }));
  }, []);

  const pendingDollars = pendingEarnings / 100;
  const isConnected = connectStatus?.connected && connectStatus?.payoutsEnabled;
  const meetsMinimum = pendingEarnings >= MIN_PAYOUT_CENTS;

  const parsedAmount = Number(amountStr);
  const amountCents = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) : 0;
  const validAmount = amountCents >= MIN_PAYOUT_CENTS && amountCents <= pendingEarnings;
  const feeCents = validAmount ? calculateFeeCents(amountCents) : 0;
  const netCents = validAmount ? amountCents - feeCents : 0;

  function handleMax() {
    setAmountStr((pendingEarnings / 100).toFixed(2));
  }

  async function handleWithdraw() {
    if (!validAmount) return;

    setLoading(true);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(
          `$${(data.net / 100).toFixed(2)} sent to your payout account — funds typically arrive in your bank in 1-2 business days.`,
        );
        window.location.reload();
      } else {
        toast.error(data.error || "Withdrawal failed");
      }
    } catch {
      toast.error("Withdrawal failed");
    }
    setLoading(false);
  }

  if (connectStatus === null) return null;
  if (!isConnected) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Withdraw Earnings</CardTitle>
      </CardHeader>
      <CardContent>
        {pendingEarnings === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pending earnings to withdraw. Complete lessons to earn money.
          </p>
        ) : !meetsMinimum ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              You have ${pendingDollars.toFixed(2)} in pending earnings. Minimum withdrawal is ${(MIN_PAYOUT_CENTS / 100).toFixed(2)}.
            </p>
            <p className="text-xs text-muted-foreground">
              Keep coaching to reach the minimum.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="withdraw-amount">Amount ($)</Label>
                <span className="text-xs text-muted-foreground">
                  Available: ${pendingDollars.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  id="withdraw-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={(MIN_PAYOUT_CENTS / 100).toFixed(2)}
                  max={pendingDollars.toFixed(2)}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder={`min $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}`}
                />
                <Button type="button" variant="outline" onClick={handleMax}>
                  Max
                </Button>
              </div>
            </div>

            {validAmount && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Withdraw</span>
                  <span>${(amountCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fee ($0.40 + 2%)</span>
                  <span>-${(feeCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>You receive</span>
                  <span className="text-green-600">${(netCents / 100).toFixed(2)}</span>
                </div>
              </div>
            )}

            <Button
              onClick={handleWithdraw}
              disabled={loading || !validAmount || netCents <= 0}
              className="w-full"
            >
              {loading
                ? "Processing..."
                : validAmount
                ? `Withdraw $${(amountCents / 100).toFixed(2)}`
                : "Enter an amount"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Funds are transferred to your connected Stripe account.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
