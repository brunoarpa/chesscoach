"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveRecoveryRequest } from "@/lib/actions/admin";
import { toast } from "sonner";

interface RecoveryRequest {
  id: string;
  username: string;
  chessComUsername: string | null;
  email: string;
  message: string | null;
  createdAt: string;
}

export function RecoveryRequestList({ requests }: { requests: RecoveryRequest[] }) {
  if (requests.length === 0) {
    return <p className="text-muted-foreground text-sm">No pending recovery requests.</p>;
  }

  async function handleResolve(id: string) {
    try {
      await resolveRecoveryRequest(id);
      toast.success("Recovery request resolved");
    } catch {
      toast.error("Failed to resolve request");
    }
  }

  return (
    <div className="space-y-4">
      {requests.map((req) => (
        <Card key={req.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {req.username}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {new Date(req.createdAt).toLocaleDateString()}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2 text-sm">
              {req.chessComUsername && (
                <Badge variant="secondary">
                  Chess.com:{" "}
                  <a
                    href={`https://www.chess.com/member/${req.chessComUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline ml-1"
                  >
                    {req.chessComUsername}
                  </a>
                </Badge>
              )}
              <Badge variant="outline">{req.email}</Badge>
            </div>
            {req.message && (
              <p className="text-sm text-muted-foreground">{req.message}</p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResolve(req.id)}
            >
              Mark Resolved
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
