"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Channel } from "pusher-js";
import type { Arrow } from "react-chessboard";
import { getPusherClient } from "@/lib/pusher-client";

interface UseBoardSyncOptions {
  lessonId: string;
  userId: string;
  onRemoteMoves: (moveHistory: string[], currentMoveIndex: number) => void;
  onRemoteNavigate: (currentMoveIndex: number) => void;
  onRemoteArrows: (arrows: Arrow[]) => void;
  onRemoteHighlights: (highlights: Record<string, React.CSSProperties>) => void;
  onRemoteReset: () => void;
}

export function useBoardSync({
  lessonId,
  userId,
  onRemoteMoves,
  onRemoteNavigate,
  onRemoteArrows,
  onRemoteHighlights,
  onRemoteReset,
}: UseBoardSyncOptions) {
  const channelRef = useRef<Channel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return; // Pusher not configured — skip real-time sync

    const channel = pusher.subscribe(`private-lesson-${lessonId}`);
    channelRef.current = channel;

    const onMoves = (data: { moveHistory: string[]; currentMoveIndex: number; senderId: string }) => {
      if (data.senderId === userId) return; // Ignore own events
      onRemoteMoves(data.moveHistory, data.currentMoveIndex);
    };
    const onNavigate = (data: { currentMoveIndex: number; senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteNavigate(data.currentMoveIndex);
    };
    const onArrows = (data: { arrows: Arrow[]; senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteArrows(data.arrows);
    };
    const onHighlights = (data: { highlights: Record<string, React.CSSProperties>; senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteHighlights(data.highlights);
    };
    const onReset = (data: { senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteReset();
    };

    channel.bind("board:moves", onMoves);
    channel.bind("board:navigate", onNavigate);
    channel.bind("board:arrows", onArrows);
    channel.bind("board:highlights", onHighlights);
    channel.bind("board:reset", onReset);

    return () => {
      // Unbind only *our* handlers (pass the reference) and never unsubscribe —
      // chat, presence, and call:status share this same channel, so tearing it
      // down here would silently break their realtime sync.
      channel.unbind("board:moves", onMoves);
      channel.unbind("board:navigate", onNavigate);
      channel.unbind("board:arrows", onArrows);
      channel.unbind("board:highlights", onHighlights);
      channel.unbind("board:reset", onReset);
      channelRef.current = null;
    };
  }, [lessonId, userId, onRemoteMoves, onRemoteNavigate, onRemoteArrows, onRemoteHighlights, onRemoteReset]);

  // Broadcast move + persist to DB (debounced DB write)
  const broadcastMoves = useCallback(
    (moveHistory: string[], currentMoveIndex: number) => {
      // Build PGN string from move history for DB persistence
      const pgn = moveHistory.length > 0 ? buildPgnFromMoves(moveHistory) : "";

      // Debounce the DB persist, but always broadcast immediately via API
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetch(`/api/lesson/${lessonId}/board`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boardPgn: pgn, moveHistory, currentMoveIndex }),
        }).catch(() => {});
      }, 300);
    },
    [lessonId]
  );

  // Broadcast ephemeral state (no DB persist)
  const broadcastSync = useCallback(
    (event: string, data: Record<string, unknown>) => {
      fetch(`/api/lesson/${lessonId}/board/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, data }),
      }).catch(() => {});
    },
    [lessonId]
  );

  const broadcastNavigate = useCallback(
    (currentMoveIndex: number) => {
      broadcastSync("board:navigate", { currentMoveIndex });
    },
    [broadcastSync]
  );

  const broadcastArrows = useCallback(
    (arrows: Arrow[]) => {
      broadcastSync("board:arrows", { arrows });
    },
    [broadcastSync]
  );

  const broadcastHighlights = useCallback(
    (highlights: Record<string, React.CSSProperties>) => {
      broadcastSync("board:highlights", { highlights });
    },
    [broadcastSync]
  );

  const broadcastReset = useCallback(() => {
    broadcastSync("board:reset", {});
  }, [broadcastSync]);

  return {
    broadcastMoves,
    broadcastNavigate,
    broadcastArrows,
    broadcastHighlights,
    broadcastReset,
    channel: channelRef,
  };
}

function buildPgnFromMoves(moves: string[]): string {
  let pgn = "";
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) {
      pgn += `${Math.floor(i / 2) + 1}. `;
    }
    pgn += moves[i] + " ";
  }
  return pgn.trim();
}
