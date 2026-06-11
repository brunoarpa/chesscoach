"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { submitChessComUsername } from "@/lib/actions/auth";
import { toast } from "sonner";

export function ChessComVerificationForm() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await submitChessComUsername(formData);
    setLoading(false);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Submitted! An admin will verify your account.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verify Chess.com Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Chess.com Username</Label>
            <Input
              name="chessComUsername"
              required
              placeholder="Your chess.com username"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Submitting..." : "Submit for Verification"}
          </Button>
          <div className="rounded-md bg-muted p-3 space-y-2">
            <p className="text-xs font-medium">How verification works:</p>
            <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
              <li>Enter your chess.com username above and submit.</li>
              <li>
                Send a message on chess.com to{" "}
                <a
                  href="https://www.chess.com/member/elochaserverification"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-foreground underline underline-offset-2 hover:text-primary"
                >
                  EloChaserVerification
                </a>{" "}
                with your website username so we can confirm you own the account.
              </li>
              <li>An admin will review and verify your account.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              You may also be contacted by an admin to complete this step.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
