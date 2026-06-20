"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    setLoading(true);
    try {
      await verifyUser(user.id);
      toast.success(`Verified ${user.username} - rating and account age fetched from chess.com`);
    } catch {
      toast.error("Failed to verify. Check if the chess.com username is valid.");
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
            <p className="text-xs text-muted-foreground mt-1">
              Rating and account age will be auto-fetched from chess.com
            </p>
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
      </CardContent>
    </Card>
  );
}
