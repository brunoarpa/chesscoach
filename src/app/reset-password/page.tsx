"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [username, setUsername] = useState("");
  const [chessComUsername, setChessComUsername] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, chessComUsername, contactInfo, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Account Recovery</CardTitle>
          <CardDescription>
            Submit a request to recover your account. An admin will verify your
            identity and get back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-2">
              <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/30 p-3 rounded-md">
                Your recovery request has been submitted. An admin will review it
                and contact you to help you regain access.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-3 rounded-md mb-4">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Your ChessConnect username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chessComUsername">
                    Chess.com Username{" "}
                    <span className="text-muted-foreground font-normal">(if linked)</span>
                  </Label>
                  <Input
                    id="chessComUsername"
                    value={chessComUsername}
                    onChange={(e) => setChessComUsername(e.target.value)}
                    placeholder="Your chess.com username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactInfo">How can we reach you?</Label>
                  <Input
                    id="contactInfo"
                    required
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="Email, Discord, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">
                    Additional info{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Anything that helps verify your identity"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Recovery Request"}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
