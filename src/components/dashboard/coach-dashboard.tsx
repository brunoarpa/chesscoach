"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { respondToLessonRequest, confirmLesson, submitReview } from "@/lib/actions/lessons";
import { toast } from "sonner";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Request {
  id: string;
  type: string;
  durationMinutes: number;
  estimatedCost: number;
  status: string;
  studentConfirmed: boolean;
  coachConfirmed: boolean;
  createdAt: string;
  student: { username: string; chessComUsername: string | null };
}

const statusColors: Record<string, string> = {
  PENDING: "secondary",
  ACCEPTED: "default",
  DECLINED: "destructive",
  EXPIRED: "outline",
  COMPLETED: "default",
  CANCELLED: "outline",
};

export function CoachDashboard({ requests }: { requests: Request[] }) {
  const pending = requests.filter((r) => r.status === "PENDING");
  const accepted = requests.filter((r) => r.status === "ACCEPTED");
  const completed = requests.filter((r) => r.status === "COMPLETED");
  const other = requests.filter(
    (r) => !["PENDING", "ACCEPTED", "COMPLETED"].includes(r.status)
  );

  return (
    <div className="space-y-8">
      {pending.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Pending Requests</h2>
          <div className="space-y-3">
            {pending.map((r) => (
              <PendingRequestCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}

      {accepted.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Active Lessons</h2>
          <div className="space-y-3">
            {accepted.map((r) => (
              <ActiveLessonCard key={r.id} request={r} role="coach" />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Completed</h2>
          <div className="space-y-3">
            {completed.map((r) => (
              <CompletedCard key={r.id} request={r} otherUser={r.student} />
            ))}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">History</h2>
          <div className="space-y-3">
            {other.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium">{r.student.username}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      {r.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {r.durationMinutes}min · ${(r.estimatedCost / 100).toFixed(2)}
                    </span>
                  </div>
                  <Badge variant={statusColors[r.status] as "default" | "secondary" | "destructive" | "outline"}>
                    {r.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {requests.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No lesson requests yet. Set your coaching prices in your profile to start receiving requests.
        </p>
      )}
    </div>
  );
}

function PendingRequestCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);

  async function handleRespond(action: "accept" | "decline") {
    setLoading(true);
    const result = await respondToLessonRequest(request.id, action);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success(action === "accept" ? "Accepted!" : "Declined.");
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{request.student.username}</span>
            <span className="text-sm text-muted-foreground ml-2">
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · ${(request.estimatedCost / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleRespond("accept")} disabled={loading}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleRespond("decline")} disabled={loading}>
              Decline
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveLessonCard({ request, role }: { request: Request; role: "coach" | "student" }) {
  const [loading, setLoading] = useState(false);
  const otherUser = "student" in request ? request.student : (request as unknown as { coach: Request["student"] }).coach;
  const myConfirmed = role === "coach" ? request.coachConfirmed : request.studentConfirmed;
  const otherConfirmed = role === "coach" ? request.studentConfirmed : request.coachConfirmed;

  async function handleConfirm() {
    setLoading(true);
    const result = await confirmLesson(request.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Confirmed!");
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{otherUser.username}</span>
            <span className="text-sm text-muted-foreground ml-2">
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · ${(request.estimatedCost / 100).toFixed(2)}
            </span>
            {/* Show chess.com username since request was accepted */}
            {otherUser.chessComUsername && (
              <div className="text-sm font-medium text-blue-600 mt-1">
                Chess.com: {otherUser.chessComUsername}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {myConfirmed ? "✓ You confirmed" : "⏳ Awaiting your confirmation"}
              {" · "}
              {otherConfirmed ? "✓ They confirmed" : "⏳ Awaiting their confirmation"}
            </div>
          </div>
          {!myConfirmed && (
            <Button size="sm" onClick={handleConfirm} disabled={loading}>
              Mark Complete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CompletedCard({ request, otherUser }: { request: Request; otherUser: { username: string } }) {
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleReview(formData: FormData) {
    const result = await submitReview(formData);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Review submitted!");
      setSubmitted(true);
      setShowReview(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{otherUser.username}</span>
            <span className="text-sm text-muted-foreground ml-2">
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · ${(request.estimatedCost / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge>Completed</Badge>
            {!submitted && (
              <Button size="sm" variant="outline" onClick={() => setShowReview(!showReview)}>
                Review
              </Button>
            )}
          </div>
        </div>
        {showReview && (
          <form action={handleReview} className="mt-4 space-y-3 border-t pt-4">
            <input type="hidden" name="lessonId" value={request.id} />
            <div className="flex items-center gap-2">
              <label className="text-sm">Rating:</label>
              <Input
                name="rating"
                type="number"
                min={1}
                max={5}
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">/ 5</span>
            </div>
            <Textarea
              name="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional comment..."
              maxLength={500}
            />
            <Button size="sm" type="submit">
              Submit Review
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export { ActiveLessonCard, CompletedCard };
