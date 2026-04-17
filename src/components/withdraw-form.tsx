"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const FEE_FLAT = 0.40;
const FEE_PERCENT = 0.02;
const MIN_PAYOUT = 5;

function calculateFee(amount: number): number {
  return FEE_FLAT + Math.ceil(amount * FEE_PERCENT * 100) / 100;
}

export function WithdrawForm({ pendingEarnings }: { pendingEarnings: number }) {
  const [loading, setLoading] = useState(false);
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

  const earningsEuros = pendingEarnings / 100;
  const fee = calculateFee(earningsEuros);
  const netAmount = earningsEuros - fee;
  const canWithdraw = earningsEuros >= MIN_PAYOUT && netAmount > 0;
  const isConnected = connectStatus?.connected && connectStatus?.chargesEnabled && connectStatus?.payoutsEnabled;

  async function handleWithdraw() {
    if (!canWithdraw) return;

    setLoading(true);
    try {
      const res = await fetch("/api/wallet/withdraw", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        toast.success(`€${(data.net / 100).toFixed(2)} withdrawn to your bank account!`);
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
        ) : !canWithdraw ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              You have €{earningsEuros.toFixed(2)} in pending earnings. Minimum withdrawal is €{MIN_PAYOUT.toFixed(2)}.
            </p>
            <p className="text-xs text-muted-foreground">
              Keep coaching to reach the minimum. Your earnings will stay safe until you&apos;re ready to withdraw.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending earnings</span>
                <span>€{earningsEuros.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Withdrawal fee (€0.40 + 2%)</span>
                <span>-€{fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium border-t pt-1">
                <span>You receive</span>
                <span className="text-green-600">€{netAmount.toFixed(2)}</span>
              </div>
            </div>
            <Button onClick={handleWithdraw} disabled={loading} className="w-full">
              {loading ? "Processing..." : `Withdraw €${netAmount.toFixed(2)}`}
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
