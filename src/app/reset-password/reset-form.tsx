"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resetPassword } from "@/lib/actions/password-auth";

export function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <p>Password updated. You can sign in with your new password.</p>
        <Link
          href="/login"
          className="block w-full text-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        formData.set("token", token);
        startTransition(async () => {
          const result = await resetPassword(formData);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setDone(true);
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
        <label htmlFor="password" className="text-sm font-medium">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 cursor-pointer disabled:opacity-60"
      >
        {pending ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
