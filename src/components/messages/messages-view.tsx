"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { getPusherClient } from "@/lib/pusher-client";
import { userChannel, MESSAGE_NEW_EVENT, MESSAGE_READ_EVENT } from "@/lib/notification-channel";
import {
  getConversation,
  sendMessage,
  markConversationRead,
  blockConversationParty,
  unblockConversationParty,
  reportConversation,
  type ConversationSummaryDTO,
  type ConversationDetailDTO,
  type MessageDTO,
} from "@/lib/actions/messages";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";

interface Props {
  userId: string;
  initialConversations: ConversationSummaryDTO[];
  initialSelectedId: string | null;
  initialDetail: ConversationDetailDTO | null;
}

export function MessagesView({
  userId,
  initialConversations,
  initialSelectedId,
  initialDetail,
}: Props) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [detail, setDetail] = useState<ConversationDetailDTO | null>(initialDetail);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  // Keep the latest selectedId available inside the Pusher handler.
  const selectedRef = useRef<string | null>(initialSelectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const d = await getConversation(id);
    setDetail(d);
    setLoadingDetail(false);
    if (d) {
      markConversationRead(id);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
      );
    }
  }, []);

  function select(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    window.history.replaceState(null, "", `/messages?c=${id}`);
    loadDetail(id);
  }

  function backToList() {
    setSelectedId(null);
    setDetail(null);
    window.history.replaceState(null, "", "/messages");
  }

  // Real-time: new messages + read receipts on the personal channel.
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(userChannel(userId));

    const onNew = (data: { conversationId: string; message: MessageDTO; senderName: string }) => {
      const { conversationId, message, senderName } = data;
      const isOpen = selectedRef.current === conversationId;

      setConversations((prev) => {
        const existing = prev.find((c) => c.id === conversationId);
        const rest = prev.filter((c) => c.id !== conversationId);
        const summary: ConversationSummaryDTO = existing
          ? {
              ...existing,
              lastMessagePreview: message.content,
              lastMessageAt: message.createdAt,
              unreadCount: isOpen ? 0 : existing.unreadCount + 1,
            }
          : {
              id: conversationId,
              // A brand-new inbound thread: the sender is the other party.
              otherParty: { id: message.senderId, username: senderName, image: null },
              lastMessagePreview: message.content,
              lastMessageAt: message.createdAt,
              unreadCount: isOpen ? 0 : 1,
            };
        return [summary, ...rest];
      });

      if (isOpen) {
        setDetail((prev) => {
          if (!prev || prev.id !== conversationId) return prev;
          if (prev.messages.some((m) => m.id === message.id)) return prev;
          return { ...prev, messages: [...prev.messages, message] };
        });
        markConversationRead(conversationId);
      }
    };

    const onRead = (data: { conversationId: string }) => {
      setDetail((prev) => {
        if (!prev || prev.id !== data.conversationId) return prev;
        const now = new Date().toISOString();
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.senderId === userId && !m.readAt ? { ...m, readAt: now } : m
          ),
        };
      });
    };

    channel.bind(MESSAGE_NEW_EVENT, onNew);
    channel.bind(MESSAGE_READ_EVENT, onRead);
    return () => {
      channel.unbind(MESSAGE_NEW_EVENT, onNew);
      channel.unbind(MESSAGE_READ_EVENT, onRead);
    };
  }, [userId]);

  async function handleSend(content: string) {
    if (!selectedId || !detail) return;
    setSending(true);
    const optimistic: MessageDTO = {
      id: `temp-${Date.now()}`,
      senderId: userId,
      content,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    setDetail((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev
    );

    const res = await sendMessage(selectedId, content);
    setSending(false);

    if ("error" in res) {
      setDetail((prev) =>
        prev
          ? { ...prev, messages: prev.messages.filter((m) => m.id !== optimistic.id) }
          : prev
      );
      toast.error(res.error);
      return;
    }

    const real = res.message;
    setDetail((prev) =>
      prev
        ? { ...prev, messages: prev.messages.map((m) => (m.id === optimistic.id ? real : m)) }
        : prev
    );
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === selectedId);
      if (!existing) return prev;
      const rest = prev.filter((c) => c.id !== selectedId);
      return [{ ...existing, lastMessagePreview: real.content, lastMessageAt: real.createdAt }, ...rest];
    });
  }

  async function handleBlock() {
    if (!selectedId) return;
    const res = await blockConversationParty(selectedId);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success("Blocked.");
    loadDetail(selectedId);
  }

  async function handleUnblock() {
    if (!selectedId) return;
    const res = await unblockConversationParty(selectedId);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success("Unblocked.");
    loadDetail(selectedId);
  }

  async function handleReport(reason: string): Promise<boolean> {
    if (!selectedId) return false;
    const res = await reportConversation(selectedId, reason);
    if ("error" in res) {
      toast.error(res.error);
      return false;
    }
    toast.success("Report submitted. Thank you.");
    return true;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border">
      {/* List pane */}
      <div
        className={`w-full flex-col overflow-y-auto border-r md:flex md:w-80 md:flex-shrink-0 ${
          selectedId ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="border-b px-4 py-3">
          <h1 className="text-sm font-semibold">Messages</h1>
        </div>
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={select}
        />
      </div>

      {/* Thread pane */}
      <div className={`flex-1 ${selectedId ? "flex" : "hidden md:flex"} flex-col`}>
        {selectedId && detail ? (
          <MessageThread
            detail={detail}
            userId={userId}
            sending={sending}
            onSend={handleSend}
            onBlock={handleBlock}
            onUnblock={handleUnblock}
            onReport={handleReport}
            onBack={backToList}
          />
        ) : loadingDetail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">Select a conversation to start messaging.</p>
          </div>
        )}
      </div>
    </div>
  );
}
