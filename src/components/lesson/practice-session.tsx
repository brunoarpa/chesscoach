"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChessBoard } from "@/components/lesson/chess-board";
import { ChatPanel } from "@/components/lesson/chat-panel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Info } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";

// A solo, sandboxed copy of the real lesson room used purely for onboarding:
// it reuses the actual ChessBoard and ChatPanel so people see the exact UI a
// real lesson has, but everything runs locally - no second participant, no
// realtime sync, no DB, and no audio/video call. A Coach/Student toggle lets one
// person experience the room from both sides.
const PRACTICE_LESSON_ID = "practice";
const PRACTICE_USER_ID = "practice-user";

export function PracticeSession() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [activeTab, setActiveTab] = useState<string>("board");

  // In a real lesson "other" is the live partner; here it's only the label an
  // incoming bubble would carry (one never arrives in solo mode).
  const otherName = "Coach";

  return (
    <div className="flex flex-col h-full">
      {/* Top bar - mirrors the real lesson room's header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base font-semibold">Practice Lesson</h1>
          <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 bg-primary/5 text-primary">
            Practice mode
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/" title="Leave the practice room">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Leave
          </Link>
        </Button>
      </div>

      {/* Onboarding note */}
      <div className="flex items-start gap-2 px-4 py-2 text-xs text-muted-foreground bg-muted/40 border-b">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          This is a private sandbox, nothing here is saved or shared. Make moves for{" "}
          <strong>both sides</strong>, try the eval bar, engine hints (the bulb), flip the board, or
          import a game. A real lesson works exactly like this (call lessons add audio).
        </p>
      </div>

      {/* Board + chat layout - single layout chosen by media query, matching the
          real lesson room so each child mounts exactly once. */}
      {isDesktop ? (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex justify-center items-start p-4 overflow-y-auto min-h-0">
            <ChessBoard
              local
              lessonId={PRACTICE_LESSON_ID}
              userId={PRACTICE_USER_ID}
              isCoach={false}
            />
          </div>
          <div className="w-[360px] border-l flex flex-col min-h-0">
            <div className="flex-1 min-h-0">
              <ChatPanel
                local
                lessonId={PRACTICE_LESSON_ID}
                userId={PRACTICE_USER_ID}
                otherName={otherName}
                initialMessages={[]}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="w-full justify-start rounded-none border-b bg-background">
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
            </TabsList>
            {/* forceMount keeps both panels mounted (Radix toggles `hidden`), so
                switching tabs doesn't reset the board or chat state. */}
            <TabsContent forceMount value="board" className="flex-1 min-h-0 p-2 m-0 flex justify-center items-start overflow-y-auto data-[state=inactive]:hidden">
              <ChessBoard
                local
                lessonId={PRACTICE_LESSON_ID}
                userId={PRACTICE_USER_ID}
                isCoach={false}
              />
            </TabsContent>
            <TabsContent forceMount value="chat" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
              <ChatPanel
                local
                lessonId={PRACTICE_LESSON_ID}
                userId={PRACTICE_USER_ID}
                otherName={otherName}
                initialMessages={[]}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
