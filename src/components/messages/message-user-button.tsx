"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startConversation } from "@/lib/actions/messages";

interface Props {
  userId: string;
}

export function MessageUserButton({ userId }: Props) {
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
    <Button variant="outline" onClick={handleClick} disabled={loading} className="gap-1.5">
      <MessageSquare className="h-4 w-4" />
      Message
    </Button>
  );
}
