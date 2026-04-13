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
          <p className="text-xs text-muted-foreground">
            An admin will verify your account by checking your chess.com profile.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
