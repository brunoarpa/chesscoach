"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChessBoard } from "@/components/lesson/chess-board";
import { ChatPanel } from "@/components/lesson/chat-panel";
import { VideoCall } from "@/components/lesson/video-call";
import { LessonControls } from "@/components/lesson/lesson-controls";

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
  const [activeTab, setActiveTab] = useState<string>("board");
  const isCall = communicationMethod === "CALL";
  const otherName = isCoach ? studentName : coachName;
  const lessonModeLabel = communicationMethod === "CALL" ? "Call Lesson" : "Chat Lesson";

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">
            Lesson with {otherName}
          </h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full border text-muted-foreground">
            {lessonModeLabel}
          </span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${otherJoined ? "text-green-600 border-green-500/40" : "text-amber-600 border-amber-500/40"}`}>
            {otherJoined ? "Other participant joined" : "Waiting for other participant"}
          </span>
          {scheduledStartAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(scheduledStartAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {scheduledEndAt && ` – ${new Date(scheduledEndAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          )}
        </div>
        <LessonControls
          lessonId={lessonId}
          lessonStatus={lessonStatus}
          isCoach={isCoach}
          scheduledStartAt={scheduledStartAt}
          otherJoined={otherJoined}
        />
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Board */}
        <div className="flex-1 flex items-center justify-center p-4">
          <ChessBoard lessonId={lessonId} userId={userId} isCoach={isCoach} initialBoardPgn={initialBoardPgn} />
        </div>

        {/* Side panel */}
        <div className="w-[360px] border-l flex flex-col min-h-0">
          {isCall && (
            <div className="border-b">
              <VideoCall
                lessonId={lessonId}
                userId={userId}
                isCoach={isCoach}
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
            {isCall && <TabsTrigger value="video">Video</TabsTrigger>}
          </TabsList>
          <TabsContent value="board" className="flex-1 flex items-center justify-center p-2 m-0">
            <ChessBoard lessonId={lessonId} userId={userId} isCoach={isCoach} initialBoardPgn={initialBoardPgn} />
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
            <TabsContent value="video" className="flex-1 m-0 p-2">
              <VideoCall
                lessonId={lessonId}
                userId={userId}
                isCoach={isCoach}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
