"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelLessonRequest, confirmLessonStart, declineAcceptedLesson, submitReview, disputeLesson } from "@/lib/actions/lessons";
import { toast } from "sonner";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { getEffectiveAvailability } from "@/lib/utils";

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
  communicationMethod: string | null;
  message: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  studentStartConfirmed: boolean;
  coachStartConfirmed: boolean;
  studentConfirmed: boolean;
  coachConfirmed: boolean;
  createdAt: string;
  coach: { username: string | null; chessComUsername: string | null };
  reviews: MyReview[];
}

interface FavouriteCoach {
  id: string;
  username: string;
  coachAvailability: string;
  chessRating: number | null;
  coachChatPrice: number | null;
  coachCallPrice: number | null;
  lastActiveAt: string | null;
}

const statusColors: Record<string, string> = {
  PENDING: "secondary",
  ACCEPTED: "default",
  IN_PROGRESS: "default",
  DECLINED: "destructive",
  EXPIRED: "outline",
  COMPLETED: "default",
  CANCELLED: "outline",
  DISPUTED: "destructive",
};

const availabilityColors: Record<string, string> = {
  AVAILABLE: "bg-green-500",
  UNAVAILABLE: "bg-gray-400",
};

function RequestMeta({ request }: { request: Request }) {
  return (
    <>
      <span className="text-sm text-muted-foreground sm:ml-2 block sm:inline mt-0.5 sm:mt-0">
        Lesson · {request.durationMinutes}min · {request.isTrial ? "Free" : `€${(request.estimatedCost / 100).toFixed(2)}`}
        {request.communicationMethod && ` · ${request.communicationMethod === "CALL" ? "Call" : "Chat"}`}
        {request.scheduledStartAt && ` · ${new Date(request.scheduledStartAt).toLocaleString()}`}
      </span>
      {request.isTrial && <Badge variant="secondary" className="ml-2">FREE TRIAL</Badge>}
    </>
  );
}

export function StudentDashboard({ requests, freeTrialsRemaining, hasActiveDispute, favouriteCoaches, completedTotal, otherTotal }: { requests: Request[]; freeTrialsRemaining: number; hasActiveDispute: boolean; favouriteCoaches: FavouriteCoach[]; completedTotal: number; otherTotal: number }) {
  const pending = requests.filter((r) => r.status === "PENDING");
  const accepted = requests.filter((r) => r.status === "ACCEPTED");
  const inProgress = requests.filter((r) => r.status === "IN_PROGRESS");
  const disputed = requests.filter((r) => r.status === "DISPUTED");
  const completed = requests.filter((r) => r.status === "COMPLETED");

  return (
    <div className="space-y-8">
      {hasActiveDispute && (
        <div className="p-3 rounded-lg border border-destructive bg-destructive/10 text-sm">
          <p className="font-medium text-destructive">You have an active lesson dispute.</p>
          <p className="text-muted-foreground mt-1">
            You cannot request new lessons until the dispute is resolved. An admin will review and contact you via email.
          </p>
        </div>
      )}

      {freeTrialsRemaining > 0 && (
        <div className="p-3 rounded-lg border bg-muted/50 text-sm">
          You have <span className="font-bold">{freeTrialsRemaining}</span> free {freeTrialsRemaining !== 1 ? "trials" : "trial"} remaining.
          Visit a coach&apos;s profile to request one!
        </div>
      )}

      {favouriteCoaches.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Favourite Coaches</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {favouriteCoaches.map((coach) => (
              <Link key={coach.id} href={`/profile/${coach.username}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="pt-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${availabilityColors[coach.lastActiveAt ? getEffectiveAvailability(coach.coachAvailability, new Date(coach.lastActiveAt), coach.coachChatPrice, coach.coachCallPrice) : coach.coachAvailability] ?? "bg-gray-400"}`} />
                      <div>
                        <span className="font-medium">{coach.username}</span>
                        {coach.chessRating && (
                          <span className="text-sm text-muted-foreground ml-2">
                            {coach.chessRating} ELO
                          </span>
                        )}
                      </div>
                    </div>
                    {coach.coachChatPrice != null && (
                      <span className="text-sm text-muted-foreground">
                        €{(coach.coachChatPrice / 100).toFixed(2)}/slot
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
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
          <h2 className="text-lg font-semibold mb-4">Awaiting Start</h2>
          <p className="text-sm text-muted-foreground mb-3">Both you and the coach must confirm the lesson has started.</p>
          <div className="space-y-3">
            {accepted.map((r) => (
              <StudentAcceptedCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Active Lessons</h2>
          <div className="space-y-3">
            {inProgress.map((r) => (
              <StudentActiveCard key={r.id} request={r} />
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
                      <RequestMeta request={r} />
                    </div>
                    <Badge variant="destructive">Disputed — Awaiting Admin Review</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    An admin will review this dispute and contact you via email.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Completed</h2>
            {completedTotal > 3 && (
              <Link href="/dashboard/history?role=student" className="text-sm text-muted-foreground underline">
                View all ({completedTotal}) &rarr;
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {completed.map((r) => (
              <StudentCompletedCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      )}

      {otherTotal > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">History</h2>
            <Link href="/dashboard/history?role=student" className="text-sm text-muted-foreground underline">
              View all ({otherTotal}) &rarr;
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Declined, cancelled, expired and no-show requests are kept in your history page.
          </p>
        </section>
      )}

      {requests.length === 0 && favouriteCoaches.length === 0 && otherTotal === 0 && (
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
            <RequestMeta request={request} />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Waiting for coach</Badge>
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
          </div>
        </div>
        {request.message && (
          <div className="mt-2 p-2 bg-muted rounded text-sm">
            <span className="text-xs text-muted-foreground">Your message: </span>
            {request.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StudentAcceptedCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);
  const [declLoading, setDeclLoading] = useState(false);

  async function handleConfirmStart() {
    setLoading(true);
    const result = await confirmLessonStart(request.id);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Start confirmed!");
  }

  async function handleDecline() {
    setDeclLoading(true);
    const result = await declineAcceptedLesson(request.id);
    setDeclLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Lesson declined. Funds released.");
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{request.coach.username}</span>
            <RequestMeta request={request} />
            <div className="text-xs text-muted-foreground mt-1">
              {request.studentStartConfirmed ? "✓ You confirmed start" : "⏳ Confirm when lesson starts"}
              {" · "}
              {request.coachStartConfirmed ? "✓ Coach confirmed start" : "⏳ Awaiting coach start confirmation"}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/lesson/${request.id}`}>
              <Button size="sm" variant="default">Join Lesson</Button>
            </Link>
            {!request.studentStartConfirmed && (
              <Button size="sm" variant="outline" onClick={handleConfirmStart} disabled={loading}>
                Confirm Start
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleDecline} disabled={declLoading}>
              Decline
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentActiveCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const autoCompleteAt = request.scheduledEndAt
    ? new Date(new Date(request.scheduledEndAt).getTime() + 24 * 60 * 60 * 1000)
    : null;

  async function handleDispute() {
    if (disputeReason.trim().length < 30) {
      toast.error("Please describe the issue in a sentence (at least 30 characters)");
      return;
    }
    setLoading(true);
    const result = await disputeLesson(request.id, disputeReason.trim());
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Issue reported. An admin will review.");
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{request.coach.username}</span>
            <RequestMeta request={request} />
            <div className="text-xs text-muted-foreground mt-1">
              {autoCompleteAt
                ? `Auto-completes ${autoCompleteAt.toLocaleString()} unless you report an issue.`
                : "Will auto-complete after the dispute window."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/lesson/${request.id}`}>
              <Button size="sm" variant="default">Join Lesson</Button>
            </Link>
            <Button size="sm" variant="destructive" onClick={() => setShowDispute(!showDispute)} disabled={loading}>
              Report Issue
            </Button>
          </div>
        </div>
        {showDispute && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              If the lesson was unsatisfactory (coach barely showed up, no teaching happened, etc.), describe what went wrong. An admin will review and contact both parties via email.
            </p>
            <Textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Describe what went wrong in a sentence (at least 30 characters)..."
              maxLength={1000}
            />
            <Button size="sm" variant="destructive" onClick={handleDispute} disabled={loading || disputeReason.trim().length < 30}>
              Submit Report
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StudentCompletedCard({ request }: { request: Request }) {
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
            <RequestMeta request={request} />
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
