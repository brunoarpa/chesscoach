"use client";

import { useActionState, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { setUsername } from "@/lib/actions/auth";
import { useRouter } from "next/navigation";

export default function SetupUsernamePage() {
  const router = useRouter();
  const [step, setStep] = useState<"username" | "coach">("username");

  const [state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const result = await setUsername(formData);
      return result;
    },
    null,
  );

  useEffect(() => {
    if (state?.success) {
      setStep("coach");
    }
  }, [state]);

  if (step === "coach") {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome!</CardTitle>
            <CardDescription>
              Do you want to teach chess on ChessCoach as well?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Set a price and pick the languages you teach in. Verifying your chess.com account is optional but adds a trust badge to your profile. You can always do this later.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="w-full"
                onClick={() => router.push("/profile/edit?coach=1")}
              >
                Yes, set me up as a coach
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/dashboard")}
              >
                Not right now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Choose your username</CardTitle>
          <CardDescription>
            Pick a username to use on ChessCoach. This will be visible to other users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="text-sm text-red-500 bg-red-500/10 p-3 rounded-md">
                {state.error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                required
                minLength={3}
                maxLength={20}
                pattern="^[a-zA-Z0-9_]+$"
                placeholder="e.g. magnus_fan"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                3-20 characters. Letters, numbers, and underscores only.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Setting up..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
