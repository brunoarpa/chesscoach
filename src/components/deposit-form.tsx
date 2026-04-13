"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function DepositForm() {
  const [amount, setAmount] = useState("5.00");
  const [loading, setLoading] = useState(false);

  async function handleDeposit() {
    const cents = Math.round(Number(amount) * 100);
    if (cents < 500) {
      toast.error("Minimum deposit is $5.00");
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
        // Dev mode: direct deposit
        toast.success(`$${(cents / 100).toFixed(2)} deposited!`);
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
            <Label>Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minimum $5.00</p>
          </div>
          <Button onClick={handleDeposit} disabled={loading}>
            {loading ? "Processing..." : "Deposit"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
