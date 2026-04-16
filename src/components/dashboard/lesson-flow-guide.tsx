"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

const steps = [
  {
    number: 1,
    title: "Request a Lesson",
    description: "Student visits a coach's profile and sends a lesson request with the desired duration.",
  },
  {
    number: 2,
    title: "Coach Accepts",
    description: "The coach reviews the request and accepts or declines. If declined, reserved funds are released.",
  },
  {
    number: 3,
    title: "Both Confirm Start",
    description: "Contact each other via Chess.com and both confirm the lesson has started.",
  },
  {
    number: 4,
    title: "Have the Lesson",
    description: "The lesson is in progress. Teach, learn, and enjoy!",
  },
  {
    number: 5,
    title: "Both Confirm Completion",
    description: "When done, both student and coach confirm the lesson is complete. Payment is then transferred.",
  },
  {
    number: 6,
    title: "Leave Reviews",
    description: "Rate each other 1–5 stars. Reviews help the community find great coaches and students.",
  },
];

export function LessonFlowGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="text-base flex items-center justify-between">
          <span>How a Lesson Works</span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          <ol className="relative border-l border-muted-foreground/20 ml-3 space-y-4">
            {steps.map((step) => (
              <li key={step.number} className="pl-6">
                <span className="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {step.number}
                </span>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}
