"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  MIN_PAYOUT_CENTS,
  PAYOUT_BASE_FEE_CENTS,
  PLATFORM_FEE_PERCENT,
  payoutCommission,
  payoutFee,
} from "@/lib/fees";

export function WithdrawForm({
  pendingEarnings,
  heldEarnings = 0,
}: {
  pendingEarnings: number;
  /** Earnings frozen pending a no-show dispute - not withdrawable yet. */
  heldEarnings?: number;
}) {
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

  // The withdrawal reloads the page to refresh balances, which would wipe the
  // success toast before it's readable. We stash the message and replay it once
  // the page comes back so the "1-2 business days" note actually gets seen.
  useEffect(() => {
    const msg = sessionStorage.getItem("withdrawSuccess");
    if (msg) {
      sessionStorage.removeItem("withdrawSuccess");
      toast.success(msg, { duration: 8000 });
    }
  }, []);

  const pendingDollars = pendingEarnings / 100;
  // Withdrawable excludes earnings held pending a no-show dispute - mirrors the
  // server-side hold so the form never offers money the API will refuse.
  const withdrawable = Math.max(0, pendingEarnings - heldEarnings);
  const withdrawableDollars = withdrawable / 100;
  const heldDollars = heldEarnings / 100;
  const isConnected = connectStatus?.connected && connectStatus?.payoutsEnabled;
  const meetsMinimum = withdrawable >= MIN_PAYOUT_CENTS;

  const parsedAmount = Number(amountStr);
  const amountCents = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) : 0;
  const validAmount = amountCents >= MIN_PAYOUT_CENTS && amountCents <= withdrawable;
  const commissionCents = validAmount ? payoutCommission(amountCents) : 0;
  const feeCents = validAmount ? payoutFee(amountCents) : 0;
  const netCents = validAmount ? amountCents - feeCents : 0;

  function handleMax() {
    setAmountStr((withdrawable / 100).toFixed(2));
  }

  const heldNote =
    heldEarnings > 0 ? (
      <p className="text-xs text-amber-700 dark:text-amber-500">
        ${heldDollars.toFixed(2)} of your earnings is on hold pending a no-show dispute and can&apos;t be withdrawn until it&apos;s resolved.
      </p>
    ) : null;

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
        sessionStorage.setItem(
          "withdrawSuccess",
          `$${(data.net / 100).toFixed(2)} sent to your payout account - funds typically arrive in your bank in 1-2 business days.`,
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

  if (!isConnected) {
    // Don't silently hide withdrawals - explain that a payout account is the
    // prerequisite, so the "Set Up Payouts" card above makes sense.
    const detailsPending = connectStatus.connected && !connectStatus.payoutsEnabled;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Withdraw Earnings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {detailsPending
              ? "Withdrawals unlock once Stripe finishes reviewing your payout account (usually 1–2 business days)."
              : "To withdraw your earnings, connect a payout account using “Set Up Payouts” above. This is how the money reaches your bank - it only takes a minute."}
          </p>
          {pendingEarnings > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              You have <span className="font-medium">${pendingDollars.toFixed(2)}</span> in earnings waiting.
            </p>
          )}
          {heldNote && <div className="mt-2">{heldNote}</div>}
        </CardContent>
      </Card>
    );
  }

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
              You have ${withdrawableDollars.toFixed(2)} available to withdraw. Minimum withdrawal is ${(MIN_PAYOUT_CENTS / 100).toFixed(2)}.
            </p>
            {heldNote ?? (
              <p className="text-xs text-muted-foreground">
                Keep coaching to reach the minimum.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {heldNote}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="withdraw-amount">Amount (USD)</Label>
                <span className="text-xs text-muted-foreground">
                  Available: ${withdrawableDollars.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  id="withdraw-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={(MIN_PAYOUT_CENTS / 100).toFixed(2)}
                  max={withdrawableDollars.toFixed(2)}
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
                  <span className="text-muted-foreground">Platform commission ({(PLATFORM_FEE_PERCENT * 100).toFixed(0)}%)</span>
                  <span>-${(commissionCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stripe payout fee (constant)</span>
                  <span>-${(PAYOUT_BASE_FEE_CENTS / 100).toFixed(2)}</span>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
