"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const PROCESSING_FEE = 0.50;
const MIN_DEPOSIT = 5;
const MAX_DEPOSIT = 10;

export function DepositForm() {
  const [amount, setAmount] = useState("5.00");
  const [loading, setLoading] = useState(false);

  const depositValue = Number(amount) || 0;
  const totalCharge = depositValue + PROCESSING_FEE;

  async function handleDeposit() {
    const cents = Math.round(depositValue * 100);
    if (cents < MIN_DEPOSIT * 100) {
      toast.error(`Minimum deposit is €${MIN_DEPOSIT.toFixed(2)}`);
      return;
    }
    if (cents > MAX_DEPOSIT * 100) {
      toast.error(`Maximum deposit is €${MAX_DEPOSIT.toFixed(2)}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: cents }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        toast.success(`€${(cents / 100).toFixed(2)} deposited!`);
        window.location.reload();
      } else {
        toast.error(data.error || "Failed to create deposit");
      }
    } catch {
      toast.error("Failed to create deposit");
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deposit Funds</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-4">
          <div className="flex-1 space-y-2">
            <Label>Amount (€)</Label>
            <Input
              type="number"
              step="0.01"
              min={MIN_DEPOSIT}
              max={MAX_DEPOSIT}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Min €{MIN_DEPOSIT.toFixed(2)} · Max €{MAX_DEPOSIT.toFixed(2)}
            </p>
          </div>
          <Button onClick={handleDeposit} disabled={loading || depositValue < MIN_DEPOSIT || depositValue > MAX_DEPOSIT}>
            {loading ? "Processing..." : "Deposit"}
          </Button>
        </div>
        {depositValue >= MIN_DEPOSIT && depositValue <= MAX_DEPOSIT && (
          <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit</span>
              <span>€{depositValue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Processing fee</span>
              <span>€{PROCESSING_FEE.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>Total charge</span>
              <span>€{totalCharge.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
