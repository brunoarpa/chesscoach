"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, HelpCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    number: 1,
    title: "Request a lesson",
    description: "Pick a slot on a coach's profile, choose chat or audio, and say what you want to work on. The price is held from your wallet.",
  },
  {
    number: 2,
    title: "Coach accepts",
    description: "They accept or decline. A decline refunds your wallet instantly.",
  },
  {
    number: 3,
    title: "Join the room",
    description: "The lesson room opens 5 minutes before your start time.",
  },
  {
    number: 4,
    title: "Have the lesson",
    description: "Work through positions on a shared live board over chat or audio. No outside apps.",
  },
  {
    number: 5,
    title: "Lesson completes",
    description: "Confirm to pay your coach, or it transfers automatically 24h later. Something went wrong? Report Issue in that window.",
  },
  {
    number: 6,
    title: "Leave reviews",
    description: "Rate each other 1 to 5 stars.",
  },
];

// What actually happens once you're in the room - sets student expectations so
// they come in with a goal rather than wondering what a lesson "is".
const activities = [
  "Review your games and find where they went wrong",
  "See positions and ideas on a live board",
  "Drill tactics and endgames",
  "Play practice games",
  "Talk openings, plans, and what to improve next",
];

export function LessonFlowGuide() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Hidden on board surfaces (lesson rooms, practice, game review) - it's a
  // distraction there and overlaps the controls.
  if (pathname?.startsWith("/lesson/") || pathname === "/review") {
    return null;
  }

  return (
    <>
      {/* Floating trigger button */}
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-6 right-6 z-40 gap-2 shadow-lg"
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-4 w-4" />
        How Lessons Work
      </Button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Side panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw] bg-background border-l shadow-xl transition-transform duration-200 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">How a Lesson Works</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-57px)]">
          <ol className="relative border-l border-muted-foreground/20 ml-3 space-y-6">
            {steps.map((step) => (
              <li key={step.number} className="pl-6">
                <span className="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {step.number}
                </span>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              </li>
            ))}
          </ol>

          {/* What you'll actually do in a lesson - content, not flow. */}
          <div className="mt-6">
            <p className="text-sm font-medium">What happens in a lesson?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tell your coach what to focus on, then:
            </p>
            <ul className="mt-2 space-y-1.5">
              {activities.map((item) => (
                <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-primary">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-2">
              The board updates live for both of you, backed by Stockfish 18 (~3600 Elo).
            </p>
          </div>

          {/* Hands-on practice room - try the lesson UI without booking */}
          <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium">Want to try it first?</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Open a free practice room with the real board and tools. No booking.
            </p>
            <Button asChild size="sm" className="w-full gap-2">
              <Link href="/lesson/practice" onClick={() => setOpen(false)}>
                <Play className="h-3.5 w-3.5 fill-current" />
                Try a practice lesson
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
