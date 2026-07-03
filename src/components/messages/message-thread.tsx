"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, MoreVertical, Send, Ban, Flag, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_DIRECT_MESSAGE_LENGTH } from "@/lib/validations";
import type { ConversationDetailDTO } from "@/lib/actions/messages";

function initials(username?: string | null) {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}

interface Props {
  detail: ConversationDetailDTO;
  userId: string;
  sending: boolean;
  onSend: (content: string) => void;
  onBlock: () => void;
  onUnblock: () => void;
  onReport: (reason: string) => Promise<boolean>;
  onBack?: () => void;
}

export function MessageThread({
  detail,
  userId,
  sending,
  onSend,
  onBlock,
  onUnblock,
  onReport,
  onBack,
}: Props) {
  const [input, setInput] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const amIBlocking = detail.iBlockedThem;
  const blockedByOther = detail.theyBlockedMe;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [detail.messages]);

  function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    onSend(content);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function submitReport() {
    setReporting(true);
    const ok = await onReport(reportReason.trim());
    setReporting(false);
    if (ok) {
      setReportOpen(false);
      setReportReason("");
    }
  }

  // Index of my last message that the other party has read - drives the single
  // "Seen" marker at the bottom of my messages (chess.com / iMessage style).
  let lastReadOwnIndex = -1;
  detail.messages.forEach((m, i) => {
    if (m.senderId === userId && m.readAt) lastReadOwnIndex = i;
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-3 py-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-full p-1 hover:bg-muted md:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <Avatar size="sm">
          {detail.otherParty.image && <AvatarImage src={detail.otherParty.image} alt="" />}
          <AvatarFallback>{initials(detail.otherParty.username)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {detail.otherParty.username ?? "Unknown"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-full p-1.5 hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Conversation options"
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {amIBlocking ? (
              <DropdownMenuItem onSelect={onUnblock}>
                <ShieldCheck />
                Unblock
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onSelect={onBlock}>
                <Ban />
                Block
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
              <Flag />
              Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {detail.messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Say hello!
          </p>
        )}
        {detail.messages.map((msg, i) => {
          const isOwn = msg.senderId === userId;
          return (
            <div key={msg.id}>
              <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p
                    className={`mt-1 text-[11px] ${
                      isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              {isOwn && i === lastReadOwnIndex && (
                <p className="mt-0.5 pr-1 text-right text-[10px] text-muted-foreground">Seen</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Composer / blocked notice */}
      {detail.canSend ? (
        <div className="border-t p-2">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              maxLength={MAX_DIRECT_MESSAGE_LENGTH}
              rows={1}
              className="max-h-32 min-h-9 flex-1 resize-none"
            />
            <Button size="icon" onClick={handleSend} disabled={!input.trim() || sending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t p-3 text-center text-sm text-muted-foreground">
          {amIBlocking ? (
            <span>
              You blocked {detail.otherParty.username ?? "this user"}.{" "}
              <button type="button" onClick={onUnblock} className="underline hover:text-foreground">
                Unblock
              </button>{" "}
              to message again.
            </span>
          ) : blockedByOther ? (
            "You can no longer send messages in this conversation."
          ) : (
            "You can't send messages right now."
          )}
        </div>
      )}

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {detail.otherParty.username ?? "user"}</DialogTitle>
            <DialogDescription>
              Tell us what&apos;s wrong. Our team will review this conversation.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Describe the problem (spam, harassment, scam, etc.)"
            maxLength={1000}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)} disabled={reporting}>
              Cancel
            </Button>
            <Button onClick={submitReport} disabled={reportReason.trim().length < 3 || reporting}>
              {reporting ? "Submitting..." : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
