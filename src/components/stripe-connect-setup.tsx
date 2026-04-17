"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function StripeConnectSetup() {
  const [status, setStatus] = useState<{
    connected: boolean;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/stripe/connect")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  async function handleSetup() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();

      if (data.alreadyOnboarded) {
        toast.success("Your payout account is already set up!");
        setStatus({ connected: true, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Failed to start setup");
      }
    } catch {
      toast.error("Failed to start payout setup");
    }
    setLoading(false);
  }

  if (status === null) return null;

  const isFullyOnboarded = status.connected && status.chargesEnabled && status.payoutsEnabled;
  const isPending = status.connected && status.detailsSubmitted && !isFullyOnboarded;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Payout Setup
          {isFullyOnboarded && <Badge variant="default">Active</Badge>}
          {isPending && <Badge variant="secondary">Pending Review</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isFullyOnboarded ? (
          <p className="text-sm text-muted-foreground">
            Your bank account is connected. You can withdraw your earnings anytime from your wallet.
          </p>
        ) : isPending ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Your account is being reviewed by Stripe. This usually takes 1-2 business days.
            </p>
            <Button variant="outline" onClick={handleSetup} disabled={loading}>
              {loading ? "Loading..." : "Update Details"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Connect your bank account to receive payouts for coaching lessons. Powered by Stripe.
            </p>
            <Button onClick={handleSetup} disabled={loading}>
              {loading ? "Loading..." : "Set Up Payouts"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
