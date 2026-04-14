"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelLessonRequest, confirmLesson, submitReview, disputeLesson } from "@/lib/actions/lessons";
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
  isTrial: boolean;
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
  DISPUTED: "destructive",
};

export function StudentDashboard({ requests, freeTrialsRemaining, hasActiveDispute }: { requests: Request[]; freeTrialsRemaining: number; hasActiveDispute: boolean }) {
  const pending = requests.filter((r) => r.status === "PENDING");
  const accepted = requests.filter((r) => r.status === "ACCEPTED");
  const disputed = requests.filter((r) => r.status === "DISPUTED");
  const completed = requests.filter((r) => r.status === "COMPLETED");
  const other = requests.filter(
    (r) => !["PENDING", "ACCEPTED", "COMPLETED", "DISPUTED"].includes(r.status)
  );

  return (
    <div className="space-y-8">
      {hasActiveDispute && (
        <div className="p-3 rounded-lg border border-destructive bg-destructive/10 text-sm">
          <p className="font-medium text-destructive">You have an active lesson dispute.</p>
          <p className="text-muted-foreground mt-1">
            You cannot request new lessons until the dispute is resolved. An admin will review and contact you via email or Chess.com.
          </p>
        </div>
      )}

      {freeTrialsRemaining > 0 && (
        <div className="p-3 rounded-lg border bg-muted/50 text-sm">
          You have <span className="font-bold">{freeTrialsRemaining}</span> free {freeTrialsRemaining !== 1 ? "trials" : "trial"} remaining.
          Visit a coach&apos;s profile to request one!
        </div>
      )}

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

      {disputed.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Disputed</h2>
          <div className="space-y-3">
            {disputed.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{r.coach.username}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {r.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {r.durationMinutes}min · {r.isTrial ? "Free" : `$${(r.estimatedCost / 100).toFixed(2)}`}
                      </span>
                    </div>
                    <Badge variant="destructive">Disputed — Awaiting Admin Review</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    An admin will review this dispute and contact you via email or Chess.com.
                  </p>
                </CardContent>
              </Card>
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
                      {r.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {r.durationMinutes}min · {r.isTrial ? "Free" : `$${(r.estimatedCost / 100).toFixed(2)}`}
                    </span>
                    {r.isTrial && <Badge variant="secondary" className="ml-2">FREE TRIAL</Badge>}
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
          <br />
          <a href="/how-it-works" className="underline text-sm mt-1 inline-block">
            Not sure where to start? Learn how it works
          </a>
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
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · {request.isTrial ? "Free" : `$${(request.estimatedCost / 100).toFixed(2)}`}
            </span>
            {request.isTrial && <Badge variant="secondary" className="ml-2">FREE TRIAL</Badge>}
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
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  async function handleConfirm() {
    setLoading(true);
    const result = await confirmLesson(request.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Confirmed!");
  }

  async function handleDispute() {
    if (disputeReason.trim().length < 10) {
      toast.error("Please provide a reason (at least 10 characters)");
      return;
    }
    setLoading(true);
    const result = await disputeLesson(request.id, disputeReason.trim());
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Dispute submitted. An admin will review and contact you via email or Chess.com.");
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{request.coach.username}</span>
            <span className="text-sm text-muted-foreground ml-2">
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · {request.isTrial ? "Free" : `$${(request.estimatedCost / 100).toFixed(2)}`}
            </span>
            {request.isTrial && <Badge variant="secondary" className="ml-2">FREE TRIAL</Badge>}
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
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleConfirm} disabled={loading}>
                Confirm & Pay
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setShowDispute(!showDispute)} disabled={loading}>
                Dispute
              </Button>
            </div>
          )}
        </div>
        {showDispute && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              If the lesson was unsatisfactory, describe what went wrong. An admin will review your dispute and contact both parties via email or Chess.com.
            </p>
            <Textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Describe the issue (at least 10 characters)..."
              maxLength={1000}
            />
            <Button size="sm" variant="destructive" onClick={handleDispute} disabled={loading || disputeReason.trim().length < 10}>
              Submit Dispute
            </Button>
          </div>
        )}
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
              {request.type === "GAME_REVIEW" ? "Game Review" : "Lesson"} · {request.durationMinutes}min · {request.isTrial ? "Free" : `$${(request.estimatedCost / 100).toFixed(2)}`}
            </span>
            {request.isTrial && <Badge variant="secondary" className="ml-2">FREE TRIAL</Badge>}
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
