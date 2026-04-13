"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { verifyUser, rejectUser } from "@/lib/actions/admin";
import { toast } from "sonner";

interface User {
  id: string;
  username: string;
  chessComUsername: string | null;
  createdAt: string;
}

export function VerificationList({ users }: { users: User[] }) {
  if (users.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No pending verifications.</p>;
  }

  return (
    <div className="space-y-4">
      {users.map((user) => (
        <VerificationCard key={user.id} user={user} />
      ))}
    </div>
  );
}

function VerificationCard({ user }: { user: User }) {
  const [rating, setRating] = useState("");
  const [accountAge, setAccountAge] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    if (!rating || !accountAge) {
      toast.error("Please fill in chess rating and account age");
      return;
    }
    setLoading(true);
    try {
      await verifyUser(user.id, Number(rating), accountAge);
      toast.success(`Verified ${user.username}`);
    } catch {
      toast.error("Failed to verify");
    }
    setLoading(false);
  }

  async function handleReject() {
    setLoading(true);
    try {
      await rejectUser(user.id);
      toast.success(`Rejected ${user.username}`);
    } catch {
      toast.error("Failed to reject");
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium">{user.username}</div>
            <div className="text-sm mt-1">
              Chess.com:{" "}
              <a
                href={`https://www.chess.com/member/${user.chessComUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                {user.chessComUsername}
              </a>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Joined: {new Date(user.createdAt).toLocaleDateString()}
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Chess Rating"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-32"
              />
              <Input
                type="date"
                placeholder="Account Created"
                value={accountAge}
                onChange={(e) => setAccountAge(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleVerify} disabled={loading}>
                Verify
              </Button>
              <Button size="sm" variant="destructive" onClick={handleReject} disabled={loading}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
