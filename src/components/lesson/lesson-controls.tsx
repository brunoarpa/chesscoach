"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { reportNoShow } from "@/lib/actions/lessons";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Props {
  lessonId: string;
  isCoach: boolean;
  scheduledStartAt: string | null;
  otherJoined: boolean;
}

export function LessonControls({ lessonId, isCoach, scheduledStartAt, otherJoined }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Show no-show button once the scheduled start has passed and the other party hasn't joined
  const canReportNoShow = !otherJoined && scheduledStartAt &&
    // eslint-disable-next-line react-hooks/purity -- Intentional: re-checked on each render as the parent refreshes/polls.
    Date.now() >= new Date(scheduledStartAt).getTime();

  async function handleReportNoShow() {
    if (!confirm(`Report ${isCoach ? "student" : "coach"} as no-show?`)) return;
    setLoading(true);
    const result = await reportNoShow(lessonId);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("No-show reported.");
      router.push("/dashboard");
    }
  }

  if (!canReportNoShow) return null;

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="destructive" onClick={handleReportNoShow} disabled={loading}>
        {loading ? "..." : `Report No-Show`}
      </Button>
    </div>
  );
}
