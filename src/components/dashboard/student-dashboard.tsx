"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelLessonRequest, confirmLesson, submitReview } from "@/lib/actions/lessons";
import { toast } from "sonner";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
}

interface Request {
  id: string;
  type: string;
  durationMinutes: number;
  estimatedCost: number;
  status: string;
  studentConfirmed: boolean;
  coachConfirmed: boolean;
  createdAt: string;
  coach: { username: string; chessComUsername: string | null };
  reviews: MyReview[];
}

const statusColors: Record<string, string> = {
  PENDING: "secondary",
  ACCEPTED: "default",
  DECLINED: "destructive",
  EXPIRED: "outline",
  COMPLETED: "default",
  CANCELLED: "outline",
};

export function StudentDashboard({ requests }: { requests: Request[] }) {
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
              <PendingCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}

      {accepted.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Active Lessons</h2>
          <div className="space-y-3">
            {accepted.map((r) => (
              <ActiveCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Completed</h2>
          <div className="space-y-3">
            {completed.map((r) => (
              <CompletedCard key={r.id} request={r} />
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
                    <span className="font-medium">{r.coach.username}</span>
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
          No lessons yet. Search for a coach to get started!
        </p>
      )}
    </div>
  );
}

function PendingCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    setLoading(true);
    const result = await cancelLessonRequest(request.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Request cancelled. Funds released.");
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{request.coach.username}</span>
            <span className="text-sm text-muted-foreground ml-2">
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · ${(request.estimatedCost / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Waiting for coach</Badge>
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);

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
            <span className="font-medium">{request.coach.username}</span>
            <span className="text-sm text-muted-foreground ml-2">
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · ${(request.estimatedCost / 100).toFixed(2)}
            </span>
            {request.coach.chessComUsername && (
              <div className="text-sm font-medium text-blue-600 mt-1">
                Chess.com: {request.coach.chessComUsername}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {request.studentConfirmed ? "✓ You confirmed" : "⏳ Awaiting your confirmation"}
              {" · "}
              {request.coachConfirmed ? "✓ Coach confirmed" : "⏳ Awaiting coach confirmation"}
            </div>
          </div>
          {!request.studentConfirmed && (
            <Button size="sm" onClick={handleConfirm} disabled={loading}>
              Mark Complete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CompletedCard({ request }: { request: Request }) {
  const existingReview = request.reviews?.[0] ?? null;
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(existingReview?.rating?.toString() ?? "5");
  const [comment, setComment] = useState(existingReview?.comment ?? "");
  const [saved, setSaved] = useState(false);

  async function handleReview(formData: FormData) {
    const result = await submitReview(formData);
    if (result.error) toast.error(result.error);
    else {
      toast.success(existingReview ? "Review updated!" : "Review submitted!");
      setSaved(true);
      setShowReview(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{request.coach.username}</span>
            <span className="text-sm text-muted-foreground ml-2">
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · ${(request.estimatedCost / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge>Completed</Badge>
            {existingReview && !saved ? (
              <Button size="sm" variant="outline" onClick={() => setShowReview(!showReview)}>
                Edit Review
              </Button>
            ) : !saved ? (
              <Button size="sm" variant="outline" onClick={() => setShowReview(!showReview)}>
                Review
              </Button>
            ) : null}
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
              {existingReview ? "Update Review" : "Submit Review"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
