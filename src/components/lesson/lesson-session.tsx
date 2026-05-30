"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChessBoard } from "@/components/lesson/chess-board";
import { ChatPanel } from "@/components/lesson/chat-panel";
import { AudioCall, type CallActions } from "@/components/lesson/audio-call";
import { LessonControls } from "@/components/lesson/lesson-controls";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, LogOut, Clock } from "lucide-react";
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
  lessonStatus: string;
  userId: string;
  isCoach: boolean;
  coachName: string;
  studentName: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  communicationMethod: string | null;
  initialMessages: Message[];
  otherJoined: boolean;
  initialBoardPgn: string;
}

const GRACE_PERIOD_MS = 5 * 60 * 1000;
const PRESENCE_HEARTBEAT_MS = 5000;
const PRESENCE_TIMEOUT_MS = 15000;

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LessonSession({
  lessonId,
  lessonStatus,
  userId,
  isCoach,
  coachName,
  studentName,
  scheduledStartAt,
  scheduledEndAt,
  communicationMethod,
  initialMessages,
  otherJoined,
  initialBoardPgn,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("board");
  const [inCall, setInCall] = useState(false);
  const callActionsRef = useRef<CallActions | null>(null);
  const isCall = communicationMethod === "CALL";
  const otherName = isCoach ? studentName : coachName;
  const lessonModeLabel = communicationMethod === "CALL" ? "Audio Call Lesson" : "Chat Lesson";

  // Live clock for timer
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- Presence tracking (heartbeat-based) ----
  // We start `otherOnPage = false` regardless of `otherJoined` (the historical
  // "have they ever joined" flag from the DB) and only flip to true once we
  // actually receive a heartbeat ping. Otherwise the indicator would lie:
  // "they're here!" simply because they had joined at some point in the past.
  const [otherOnPage, setOtherOnPage] = useState<boolean>(false);
  const lastPingRef = useRef<number>(0);

  // Send heartbeat
  useEffect(() => {
    let cancelled = false;
    const send = () => {
      if (cancelled) return;
      fetch(`/api/lesson/${lessonId}/board/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "presence:ping", data: {} }),
      }).catch(() => {});
    };
    send();
    const interval = setInterval(send, PRESENCE_HEARTBEAT_MS);

    // If the page becomes hidden (tab switch, minimize) tell the other side
    // immediately rather than waiting for the heartbeat to expire.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        fetch(`/api/lesson/${lessonId}/board/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "presence:leave", data: {} }),
          keepalive: true,
        }).catch(() => {});
      } else {
        send(); // re-announce when tab comes back
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Mark ourselves gone on unmount
      fetch(`/api/lesson/${lessonId}/board/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "presence:leave", data: {} }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [lessonId]);

  // Listen for remote presence
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`private-lesson-${lessonId}`);

    const onPing = (data: { senderId: string }) => {
      if (data.senderId !== userId) {
        lastPingRef.current = Date.now();
        setOtherOnPage(true);
      }
    };
    const onLeave = (data: { senderId: string }) => {
      if (data.senderId !== userId) {
        lastPingRef.current = 0;
        setOtherOnPage(false);
      }
    };

    channel.bind("presence:ping", onPing);
    channel.bind("presence:leave", onLeave);

    // Mark other as gone if no recent ping. Runs once we have ever seen a
    // ping (lastPingRef.current > 0) — before then the badge stays "not here yet".
    const checkInterval = setInterval(() => {
      if (lastPingRef.current > 0 && Date.now() - lastPingRef.current > PRESENCE_TIMEOUT_MS) {
        setOtherOnPage(false);
      }
    }, 2000);

    return () => {
      channel.unbind("presence:ping", onPing);
      channel.unbind("presence:leave", onLeave);
      clearInterval(checkInterval);
    };
  }, [lessonId, userId]);

  // ---- Remote call state ----
  const [remoteInCall, setRemoteInCall] = useState(false);
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`private-lesson-${lessonId}`);
    const handler = (data: { joined: boolean; senderId: string }) => {
      if (data.senderId !== userId) setRemoteInCall(data.joined);
    };
    channel.bind("call:status", handler);
    return () => {
      channel.unbind("call:status", handler);
    };
  }, [lessonId, userId]);

  const handleCallStatusChange = useCallback((connected: boolean) => {
    setInCall(connected);
    fetch(`/api/lesson/${lessonId}/board/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "call:status", data: { joined: connected } }),
    }).catch(() => {});
  }, [lessonId]);

  const handleJoinCall = useCallback(() => {
    callActionsRef.current?.start();
    setActiveTab("call");
  }, []);

  const handleLeaveCall = useCallback(() => {
    callActionsRef.current?.end();
  }, []);

  const handleLeaveLesson = useCallback(() => {
    if (inCall) callActionsRef.current?.end();
    router.push("/dashboard");
  }, [inCall, router]);

  // ---- Timer / grace period ----
  const endMs = scheduledEndAt ? new Date(scheduledEndAt).getTime() : null;
  const startMs = scheduledStartAt ? new Date(scheduledStartAt).getTime() : null;

  let timerLabel: string | null = null;
  let timerVariant: "normal" | "warning" | "grace" | "ended" = "normal";
  if (endMs) {
    const msToEnd = endMs - now;
    if (msToEnd > 0) {
      timerLabel = `Lesson ends in ${formatDuration(msToEnd)}`;
      if (msToEnd < 60_000) timerVariant = "warning";
    } else {
      const msGraceLeft = endMs + GRACE_PERIOD_MS - now;
      if (msGraceLeft > 0) {
        timerLabel = `Room closes in ${formatDuration(msGraceLeft)}`;
        timerVariant = "grace";
      } else {
        timerLabel = "Room closed";
        timerVariant = "ended";
      }
    }
  } else if (startMs && now < startMs) {
    timerLabel = `Starts in ${formatDuration(startMs - now)}`;
  }

  const timerColor =
    timerVariant === "warning" ? "text-amber-600 border-amber-500/50 bg-amber-500/10" :
    timerVariant === "grace"   ? "text-orange-600 border-orange-500/50 bg-orange-500/10" :
    timerVariant === "ended"   ? "text-destructive border-destructive/50 bg-destructive/10" :
                                 "text-muted-foreground border-muted-foreground/20";

  // Auto-redirect when grace period ends
  useEffect(() => {
    if (timerVariant === "ended") {
      const t = setTimeout(() => router.push("/dashboard"), 3000);
      return () => clearTimeout(t);
    }
  }, [timerVariant, router]);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base font-semibold">
            Lesson with {otherName}
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
            {lessonModeLabel}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${otherOnPage ? "text-green-600 border-green-500/40 bg-green-500/5" : "text-amber-600 border-amber-500/40 bg-amber-500/5"}`}>
            {isCoach ? "Student" : "Coach"}: {otherOnPage ? "on the page" : "not here yet"}
          </span>
          {isCall && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${inCall ? "text-green-600 border-green-500/40 bg-green-500/5" : remoteInCall ? "text-amber-600 border-amber-500/40 bg-amber-500/5" : "text-muted-foreground border-muted-foreground/20"}`}>
              {inCall ? "You: in call" : remoteInCall ? `${isCoach ? "Student" : "Coach"}: in call` : "Call: not started"}
            </span>
          )}
          {timerLabel && (
            <span className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${timerColor}`}>
              <Clock className="h-3 w-3" />
              {timerLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isCall && (
            inCall ? (
              <Button size="sm" variant="destructive" onClick={handleLeaveCall}>
                <PhoneOff className="h-4 w-4 mr-1" />
                Leave Call
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleJoinCall}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                <Phone className="h-4 w-4 mr-1" />
                Join Call
              </Button>
            )
          )}
          <LessonControls
            lessonId={lessonId}
            lessonStatus={lessonStatus}
            isCoach={isCoach}
            scheduledStartAt={scheduledStartAt}
            otherJoined={otherOnPage}
          />
          <Button size="sm" variant="outline" onClick={handleLeaveLesson} title="Leave the lesson room and return to your dashboard">
            <LogOut className="h-4 w-4 mr-1" />
            Leave Lesson
          </Button>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Board */}
        <div className="flex-1 flex items-start justify-center p-4 overflow-y-auto min-h-0">
          <ChessBoard lessonId={lessonId} userId={userId} isCoach={isCoach} initialBoardPgn={initialBoardPgn} />
        </div>

        {/* Side panel */}
        <div className="w-[360px] border-l flex flex-col min-h-0">
          {isCall && (
            <div className="border-b">
              <AudioCall
                lessonId={lessonId}
                isCoach={isCoach}
                onCallStatusChange={handleCallStatusChange}
                callActionsRef={callActionsRef}
              />
            </div>
          )}
          <div className="flex-1 min-h-0">
            <ChatPanel
              lessonId={lessonId}
              userId={userId}
              otherName={otherName}
              initialMessages={initialMessages}
            />
          </div>
        </div>
      </div>

      {/* Mobile layout - tabbed */}
      <div className="flex md:hidden flex-1 min-h-0 flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="w-full justify-start rounded-none border-b bg-background">
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            {isCall && <TabsTrigger value="call">Call</TabsTrigger>}
          </TabsList>
          <TabsContent value="board" className="flex-1 overflow-y-auto p-2 m-0">
            <div className="flex justify-center">
              <ChessBoard lessonId={lessonId} userId={userId} isCoach={isCoach} initialBoardPgn={initialBoardPgn} />
            </div>
          </TabsContent>
          <TabsContent value="chat" className="flex-1 min-h-0 m-0">
            <ChatPanel
              lessonId={lessonId}
              userId={userId}
              otherName={otherName}
              initialMessages={initialMessages}
            />
          </TabsContent>
          {isCall && (
            <TabsContent value="call" className="flex-1 m-0 p-2">
              <AudioCall
                lessonId={lessonId}
                isCoach={isCoach}
                onCallStatusChange={handleCallStatusChange}
                callActionsRef={callActionsRef}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
