"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

interface Props {
  lessonId: string;
  userId: string;
  otherName: string;
  initialMessages: Message[];
}

export function ChatPanel({ lessonId, userId, otherName, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Subscribe to Pusher for real-time messages
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return; // Pusher not configured — rely on polling

    const channel = pusher.subscribe(`private-lesson-${lessonId}`);

    const onMessage = (data: { message: Message }) => {
      // Don't add our own messages (already added optimistically)
      if (data.message.senderId === userId) return;
      setMessages((prev) => {
        // Prevent duplicates
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    };

    channel.bind("chat:message", onMessage);

    return () => {
      // Unbind only our handler; board sync / presence / call share this channel,
      // so we never unsubscribe it here.
      channel.unbind("chat:message", onMessage);
    };
  }, [lessonId, userId]);

  // Fallback: poll every 30s in case Pusher connection drops
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/lesson/${lessonId}/chat`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch {
      // Silently fail polling
    }
  }, [lessonId]);

  useEffect(() => {
    pollRef.current = setInterval(fetchMessages, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setError(null);
    setInput("");

    // Optimistic update
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      senderId: userId,
      content,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`/api/lesson/${lessonId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const data = await res.json();
        // Replace optimistic message with real one
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticMsg.id ? data.message : m))
        );
      } else {
        // Roll back optimistic message and surface the server error
        const data = await res.json().catch(() => null);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        setInput(content);
        setError(data?.error ?? "Failed to send message.");
      }
    } catch {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setInput(content);
      setError("Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.senderId === userId;
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  isOwn
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {!isOwn && (
                  <p className="text-xs font-medium mb-1 opacity-70">{otherName}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-xs mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      {error && (
        <p className="px-3 py-1 text-xs text-destructive border-t">{error}</p>
      )}
      <div className="border-t p-2 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          maxLength={100}
          className="flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!input.trim() || sending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
