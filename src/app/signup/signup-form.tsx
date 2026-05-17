"use client";

import { useState, useTransition } from "react";
import { signUpWithPassword } from "@/lib/actions/password-auth";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return sentTo ? (
    <div className="text-sm space-y-2">
      <p>Check your inbox.</p>
      <p className="text-muted-foreground">
        If an account is available for <strong>{sentTo}</strong>, we just sent a verification link.
        It expires in 1 hour.
      </p>
    </div>
  ) : (
    <form
      action={(formData) => {
        setError(null);
        const emailValue = String(formData.get("email") ?? "");
        startTransition(async () => {
          const result = await signUpWithPassword(formData);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setSentTo(emailValue);
        });
      }}
      className="space-y-3"
    >
      {error && (
        <p className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
