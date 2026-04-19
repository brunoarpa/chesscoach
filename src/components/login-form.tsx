"use client";

import { useState } from "react";
import { login } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await login(formData);
    setLoading(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account? <Link href="/signup" className="underline">Sign up</Link>
      </p>
    </form>
  );
}
