import type { Metadata } from "next";
import { PracticeSession } from "@/components/lesson/practice-session";

export const metadata: Metadata = {
  title: "Practice Lesson",
  description: "Explore the EloChaser lesson room - board, chat, and tools - in a private sandbox.",
};

// Public, login-free sandbox of the lesson room so anyone can learn the UI
// before booking or coaching. The static `practice` segment takes precedence
// over the dynamic `[id]` lesson route, so this never hits the real lesson page.
export default function PracticeLessonPage() {
  return (
    <div className="h-[calc(100dvh-4rem)]">
      <PracticeSession />
    </div>
  );
}
