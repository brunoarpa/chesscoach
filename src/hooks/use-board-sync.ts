"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Channel } from "pusher-js";
import type { Arrow } from "react-chessboard";
import { getPusherClient } from "@/lib/pusher-client";
import { type MoveTree, treeToMainlinePgn } from "@/lib/chess-tree";

interface UseBoardSyncOptions {
  lessonId: string;
  userId: string;
  // Practice/sandbox mode: a solo room with no second participant. We skip the
  // Pusher subscription and turn every broadcast into a no-op so the board runs
  // purely on local chess.js state (no realtime, no DB persistence, no API).
  local?: boolean;
  onRemoteMoves: (tree: MoveTree, currentNodeId: string) => void;
  onRemoteNavigate: (currentNodeId: string) => void;
  onRemoteArrows: (arrows: Arrow[]) => void;
  onRemoteHighlights: (highlights: Record<string, React.CSSProperties>) => void;
  onRemoteHints: (showHints: boolean) => void;
  onRemoteReset: () => void;
}

export function useBoardSync({
  lessonId,
  userId,
  local = false,
  onRemoteMoves,
  onRemoteNavigate,
  onRemoteArrows,
  onRemoteHighlights,
  onRemoteHints,
  onRemoteReset,
}: UseBoardSyncOptions) {
  const channelRef = useRef<Channel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (local) return; // Practice mode — no realtime sync
    const pusher = getPusherClient();
    if (!pusher) return; // Pusher not configured — skip real-time sync

    const channel = pusher.subscribe(`private-lesson-${lessonId}`);
    channelRef.current = channel;

    const onMoves = (data: { tree: MoveTree; currentNodeId: string; senderId: string }) => {
      if (data.senderId === userId) return; // Ignore own events
      onRemoteMoves(data.tree, data.currentNodeId);
    };
    const onNavigate = (data: { currentNodeId: string; senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteNavigate(data.currentNodeId);
    };
    const onArrows = (data: { arrows: Arrow[]; senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteArrows(data.arrows);
    };
    const onHighlights = (data: { highlights: Record<string, React.CSSProperties>; senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteHighlights(data.highlights);
    };
    const onHints = (data: { showHints: boolean; senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteHints(data.showHints);
    };
    const onReset = (data: { senderId: string }) => {
      if (data.senderId === userId) return;
      onRemoteReset();
    };

    channel.bind("board:moves", onMoves);
    channel.bind("board:navigate", onNavigate);
    channel.bind("board:arrows", onArrows);
    channel.bind("board:highlights", onHighlights);
    channel.bind("board:hints", onHints);
    channel.bind("board:reset", onReset);

    return () => {
      // Unbind only *our* handlers (pass the reference) and never unsubscribe —
      // chat, presence, and call:status share this same channel, so tearing it
      // down here would silently break their realtime sync.
      channel.unbind("board:moves", onMoves);
      channel.unbind("board:navigate", onNavigate);
      channel.unbind("board:arrows", onArrows);
      channel.unbind("board:highlights", onHighlights);
      channel.unbind("board:hints", onHints);
      channel.unbind("board:reset", onReset);
      channelRef.current = null;
    };
  }, [lessonId, userId, local, onRemoteMoves, onRemoteNavigate, onRemoteArrows, onRemoteHighlights, onRemoteHints, onRemoteReset]);

  // Broadcast the variation tree + persist to DB (debounced DB write). We persist
  // the full tree as JSON and the main line as PGN for backward-compatible reads.
  const broadcastMoves = useCallback(
    (tree: MoveTree, currentNodeId: string) => {
      if (local) return; // Practice mode — nothing to sync or persist
      const boardPgn = treeToMainlinePgn(tree);

      // Debounce the DB persist; the API also broadcasts via Pusher.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetch(`/api/lesson/${lessonId}/board`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boardPgn, boardTree: tree, currentNodeId }),
        }).catch(() => {});
      }, 300);
    },
    [lessonId, local]
  );

  // Broadcast ephemeral state (no DB persist)
  const broadcastSync = useCallback(
    (event: string, data: Record<string, unknown>) => {
      if (local) return; // Practice mode — no realtime broadcast
      fetch(`/api/lesson/${lessonId}/board/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, data }),
      }).catch(() => {});
    },
    [lessonId, local]
  );

  const broadcastNavigate = useCallback(
    (currentNodeId: string) => {
      broadcastSync("board:navigate", { currentNodeId });
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

  const broadcastHints = useCallback(
    (showHints: boolean) => {
      broadcastSync("board:hints", { showHints });
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
    broadcastHints,
    broadcastReset,
    channel: channelRef,
  };
}
