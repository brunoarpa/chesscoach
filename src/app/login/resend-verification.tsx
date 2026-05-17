"use client";

import { useState, useTransition } from "react";
import { resendVerificationEmail } from "@/lib/actions/password-auth";

export function ResendVerification() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        If your account needs verifying, we just sent a new link. Check your inbox and spam folder.
      </p>
    );
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await resendVerificationEmail(formData);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setSent(true);
        });
      }}
      className="space-y-2"
    >
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      <p className="text-xs text-muted-foreground">Didn&apos;t get the verification email? Enter your address to resend it.</p>
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:opacity-60"
        >
          {pending ? "Sending…" : "Resend"}
        </button>
      </div>
    </form>
  );
}
