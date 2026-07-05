"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startConversation } from "@/lib/actions/messages";

interface Props {
  userId: string;
  label?: string;
  className?: string;
}

export function MessageUserButton({ userId, label = "Message", className }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await startConversation(userId);
    if ("error" in res) {
      setLoading(false);
      toast.error(res.error);
      return;
    }
    router.push(`/messages?c=${res.conversationId}`);
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={loading}
      className={cn("gap-1.5", className)}
    >
      <MessageSquare className="h-4 w-4" />
      {label}
    </Button>
  );
}
