"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChessBoard } from "@/components/lesson/chess-board";
import { ChatPanel } from "@/components/lesson/chat-panel";
import { Button } from "@/components/ui/button";
import { GraduationCap, UserRound, ArrowLeft, Info } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";

// A solo, sandboxed copy of the real lesson room used purely for onboarding:
// it reuses the actual ChessBoard and ChatPanel so people see the exact UI a
// real lesson has, but everything runs locally — no second participant, no
// realtime sync, no DB, and no audio/video call. A Coach/Student toggle lets one
// person experience the room from both sides.
const PRACTICE_LESSON_ID = "practice";
const PRACTICE_USER_ID = "practice-user";

export function PracticeSession() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [activeTab, setActiveTab] = useState<string>("board");
  const [viewAsCoach, setViewAsCoach] = useState(true);

  // In a real lesson "other" is the live partner. Here it's just the label the
  // (never-arriving) incoming bubble would carry, flipped by the view toggle.
  const otherName = viewAsCoach ? "Student" : "Coach";

  const roleToggle = (
    <div className="flex items-center rounded-full border p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setViewAsCoach(true)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          viewAsCoach ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <GraduationCap className="h-3.5 w-3.5" />
        Coach view
      </button>
      <button
        type="button"
        onClick={() => setViewAsCoach(false)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
          !viewAsCoach ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <UserRound className="h-3.5 w-3.5" />
        Student view
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar — mirrors the real lesson room's header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base font-semibold">Practice Lesson</h1>
          <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 bg-primary/5 text-primary">
            Practice mode
          </span>
          {roleToggle}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/how-it-works" title="Leave the practice room">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Leave
          </Link>
        </Button>
      </div>

      {/* Onboarding note */}
      <div className="flex items-start gap-2 px-4 py-2 text-xs text-muted-foreground bg-muted/40 border-b">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          This is a private sandbox — nothing here is saved or shared. Make moves for{" "}
          <strong>both sides</strong>, try the eval bar, engine hints (the bulb), flip the board, or
          import a game. Switch between <strong>Coach view</strong> and <strong>Student view</strong>{" "}
          to see the room from each side. A real lesson works exactly like this (call lessons add audio).
        </p>
      </div>

      {/* Board + chat layout — single layout chosen by media query, matching the
          real lesson room so each child mounts exactly once. */}
      {isDesktop ? (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex items-start justify-center p-4 overflow-y-auto min-h-0">
            <ChessBoard
              local
              lessonId={PRACTICE_LESSON_ID}
              userId={PRACTICE_USER_ID}
              isCoach={viewAsCoach}
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
            <TabsContent forceMount value="board" className="flex-1 overflow-y-auto p-2 m-0 data-[state=inactive]:hidden">
              <div className="flex justify-center">
                <ChessBoard
                  local
                  lessonId={PRACTICE_LESSON_ID}
                  userId={PRACTICE_USER_ID}
                  isCoach={viewAsCoach}
                />
              </div>
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
