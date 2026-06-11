"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveContactMessage } from "@/lib/actions/admin";
import { toast } from "sonner";

interface ContactMessage {
  id: string;
  email: string;
  message: string;
  userId: string | null;
  username: string | null;
  createdAt: string;
}

export function ContactMessageList({ messages }: { messages: ContactMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-muted-foreground text-sm">No unread messages.</p>;
  }

  async function handleResolve(id: string) {
    try {
      await resolveContactMessage(id);
      toast.success("Message marked as handled");
    } catch {
      toast.error("Failed to mark message as handled");
    }
  }

  return (
    <div className="space-y-4">
      {messages.map((msg) => (
        <Card key={msg.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {msg.username ?? "Visitor (not signed in)"}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {new Date(msg.createdAt).toLocaleString()}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">
                <a href={`mailto:${msg.email}`} className="underline">{msg.email}</a>
              </Badge>
              {msg.userId && <Badge variant="secondary">Registered user</Badge>}
            </div>
            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResolve(msg.id)}
            >
              Mark Handled
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
