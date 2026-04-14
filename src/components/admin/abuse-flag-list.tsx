"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { resolveAbuseFlag, suspendUser, banUser, resolveDispute } from "@/lib/actions/admin";
import { toast } from "sonner";

interface AbuseFlag {
  id: string;
  type: string;
  severity: string;
  details: string;
  resolved: boolean;
  createdAt: string;
  user: { id: string; username: string };
  relatedUser: { id: string; username: string } | null;
  relatedLesson: {
    id: string;
    type: string;
    durationMinutes: number;
    estimatedCost: number;
  } | null;
}

const severityColors: Record<string, "destructive" | "secondary" | "outline"> = {
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

const typeLabels: Record<string, string> = {
  DUPLICATE_CARD: "Duplicate Card",
  CONFIRMATION_TIMEOUT: "Confirmation Timeout",
  ONE_SIDED_CONFIRMATION: "One-Sided Confirmation",
  COACH_NON_RESPONSIVE: "Coach Non-Responsive",
  STUDENT_SPAM: "Student Spam",
  MULTI_ACCOUNT_SUSPECTED: "Multi-Account Suspected",
  LESSON_DISPUTE: "Lesson Dispute",
};

export function AbuseFlagList({ flags }: { flags: AbuseFlag[] }) {
  async function handleResolve(flagId: string) {
    try {
      await resolveAbuseFlag(flagId);
      toast.success("Flag resolved");
    } catch {
      toast.error("Failed to resolve flag");
    }
  }

  async function handleDisputeResolution(lessonId: string, resolution: "refund" | "pay_coach") {
    const msg = resolution === "refund"
      ? "Refund the student and cancel this lesson?"
      : "Pay the coach and complete this lesson?";
    if (!confirm(msg)) return;
    try {
      await resolveDispute(lessonId, resolution);
      toast.success(resolution === "refund" ? "Student refunded, dispute resolved" : "Coach paid, dispute resolved");
    } catch {
      toast.error("Failed to resolve dispute");
    }
  }

  async function handleSuspend(userId: string) {
    if (!confirm("Suspend this user? They will not be able to make deposits or lesson requests.")) return;
    try {
      await suspendUser(userId);
      toast.success("User suspended");
    } catch {
      toast.error("Failed to suspend user");
    }
  }

  async function handleBan(userId: string) {
    if (!confirm("Ban this user? They will not be able to log in.")) return;
    try {
      await banUser(userId);
      toast.success("User banned");
    } catch {
      toast.error("Failed to ban user");
    }
  }

  if (flags.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No unresolved abuse flags. All clear!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {flags.map((flag) => (
        <Card key={flag.id}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant={severityColors[flag.severity] || "outline"}>
                    {flag.severity}
                  </Badge>
                  <Badge variant="outline">
                    {typeLabels[flag.type] || flag.type}
                  </Badge>
                  <span className="text-sm font-medium">
                    User: {flag.user.username}
                  </span>
                  {flag.relatedUser && (
                    <span className="text-sm text-muted-foreground">
                      → Linked: {flag.relatedUser.username}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{flag.details}</p>
                {flag.relatedLesson && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Lesson: {flag.relatedLesson.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {flag.relatedLesson.durationMinutes}min · ${(flag.relatedLesson.estimatedCost / 100).toFixed(2)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(flag.createdAt).toLocaleDateString()} {new Date(flag.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {flag.type === "LESSON_DISPUTE" && flag.relatedLesson ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleDisputeResolution(flag.relatedLesson!.id, "refund")}>
                      Refund Student
                    </Button>
                    <Button size="sm" variant="default" onClick={() => handleDisputeResolution(flag.relatedLesson!.id, "pay_coach")}>
                      Pay Coach
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleResolve(flag.id)}>
                    Resolve
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => handleSuspend(flag.user.id)}>
                  Suspend
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleBan(flag.user.id)}>
                  Ban
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
