"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ConversationSummaryDTO } from "@/lib/actions/messages";

function initials(username?: string | null) {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  conversations: ConversationSummaryDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, selectedId, onSelect }: Props) {
  if (conversations.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No conversations yet.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {conversations.map((c) => {
        const active = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60 ${
                active ? "bg-muted" : ""
              }`}
            >
              <Avatar size="sm">
                {c.otherParty.image && <AvatarImage src={c.otherParty.image} alt="" />}
                <AvatarFallback>{initials(c.otherParty.username)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {c.otherParty.username ?? "Unknown"}
                  </span>
                  <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-xs ${
                      c.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {c.lastMessagePreview ?? "No messages yet"}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                      {c.unreadCount > 9 ? "9+" : c.unreadCount}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
