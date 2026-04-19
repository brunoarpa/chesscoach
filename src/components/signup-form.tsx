"use client";

import { useState } from "react";
import { signup } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await signup(formData);
    setLoading(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" required minLength={3} maxLength={20} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} />
        <p className="text-xs text-muted-foreground">At least 8 characters</p>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating account..." : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </form>
  );
}
