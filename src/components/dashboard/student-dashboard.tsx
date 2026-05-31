"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelLessonRequest, confirmLessonStart, declineAcceptedLesson, submitReview, disputeLesson } from "@/lib/actions/lessons";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

// Room stays open for 5 minutes past the scheduled end. After that the
// /lesson/[id] page redirects away so the join button is pointless.
const ROOM_GRACE_MS = 5 * 60 * 1000;
// Room opens 5 minutes before the scheduled start. Before that the
// /lesson/[id] page redirects away, so the join button shouldn't show.
const EARLY_JOIN_MS = 5 * 60 * 1000;

function isRoomClosed(scheduledEndAt: string | null, now: number): boolean {
  if (!scheduledEndAt) return false;
  return now > new Date(scheduledEndAt).getTime() + ROOM_GRACE_MS;
}

// Too early to join — the join window hasn't opened yet.
function isBeforeJoinWindow(scheduledStartAt: string | null, now: number): boolean {
  if (!scheduledStartAt) return false;
  return now < new Date(scheduledStartAt).getTime() - EARLY_JOIN_MS;
}

// Lesson time is over but the room is still open for the grace window.
function isInGrace(scheduledEndAt: string | null, now: number): boolean {
  if (!scheduledEndAt) return false;
  const end = new Date(scheduledEndAt).getTime();
  return now > end && now <= end + ROOM_GRACE_MS;
}

function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

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

function StatusBadge({ status, roomClosed = false, inGrace = false }: { status: string; roomClosed?: boolean; inGrace?: boolean }) {
  if (status === "PENDING") return <Badge variant="secondary">Waiting for coach</Badge>;
  if (status === "ACCEPTED") return <Badge>Awaiting start</Badge>;
  if (status === "IN_PROGRESS") {
    if (roomClosed) return <Badge variant="outline">Lesson ended · awaiting confirmation</Badge>;
    if (inGrace) return <Badge className="bg-orange-500 hover:bg-orange-600">Wrapping up</Badge>;
    return <Badge className="bg-green-600 hover:bg-green-700">In progress</Badge>;
  }
  if (status === "DISPUTED") return <Badge variant="destructive">Disputed</Badge>;
  return null;
}

function RequestMeta({ request }: { request: Request }) {
  return (
    <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
      <span>{request.durationMinutes} min</span>
      <span>·</span>
      <span>{request.isTrial ? "Free trial" : `$${(request.estimatedCost / 100).toFixed(2)}`}</span>
      {request.communicationMethod && (
        <>
          <span>·</span>
          <span>{request.communicationMethod === "CALL" ? "Audio call" : "Chat"}</span>
        </>
      )}
      {request.scheduledStartAt && (
        <>
          <span>·</span>
          <span>{new Date(request.scheduledStartAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </>
      )}
    </div>
  );
}

export function StudentDashboard({
  requests,
  freeTrialsRemaining,
  hasActiveDispute,
  completedTotal,
  otherTotal,
}: {
  requests: Request[];
  freeTrialsRemaining: number;
  hasActiveDispute: boolean;
  completedTotal: number;
  otherTotal: number;
}) {
  const now = useNow();

  // "Truly active" = needs your attention or is happening now.
  // Sort: in-progress first, then accepted (soonest start first),
  // then pending, then disputed. Tie-break by createdAt desc.
  const STATUS_ORDER: Record<string, number> = {
    IN_PROGRESS: 0,
    ACCEPTED: 1,
    PENDING: 2,
    DISPUTED: 3,
  };

  const inActiveStatuses = (r: Request) => r.status in STATUS_ORDER;

  // IN_PROGRESS + past grace = "recently ended" — collapse into a compact list
  // at the bottom so they don't pile up in the main view. They live in the DB
  // for up to 24h before auto-completing, but they don't need attention any
  // longer beyond the dispute option.
  const recentlyEnded = requests.filter(
    (r) => r.status === "IN_PROGRESS" && isRoomClosed(r.scheduledEndAt, now)
  );
  const recentlyEndedIds = new Set(recentlyEnded.map((r) => r.id));

  const active = requests
    .filter((r) => inActiveStatuses(r) && !recentlyEndedIds.has(r.id))
    .sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      const ta = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : Infinity;
      const tb = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : Infinity;
      if (ta !== tb) return ta - tb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const completed = requests.filter((r) => r.status === "COMPLETED");
  const lastReviewable = completed.find((r) => !(r.reviews?.[0]));
  const pastTotal = completedTotal + otherTotal;

  return (
    <div className="space-y-3">
      {hasActiveDispute && (
        <div className="p-3 rounded-lg border border-destructive bg-destructive/10 text-sm">
          <p className="font-medium text-destructive">You have an active lesson dispute.</p>
          <p className="text-muted-foreground mt-1">
            You cannot request new lessons until the dispute is resolved. An admin will review and contact you via email.
          </p>
        </div>
      )}

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active lessons.{" "}
          <Link href="/search" className="underline">
            Find a coach →
          </Link>
        </p>
      ) : (
        active.map((r) => <StudentCard key={r.id} request={r} />)
      )}

      {/* Reviewable lesson (compact prompt) */}
      {lastReviewable && (
        <Card>
          <CardContent className="pt-4">
            <ReviewBlock request={lastReviewable} />
          </CardContent>
        </Card>
      )}

      {/* Recently-ended lessons (room closed, awaiting auto-complete in DB) */}
      {recentlyEnded.length > 0 && (
        <RecentlyEndedList requests={recentlyEnded} />
      )}

      {/* Compact footer */}
      <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pt-2">
        {freeTrialsRemaining > 0 && (
          <span>
            {freeTrialsRemaining} free {freeTrialsRemaining === 1 ? "trial" : "trials"} remaining
          </span>
        )}
        {pastTotal > 0 && (
          <Link href="/dashboard/history?role=student" className="underline">
            View past lessons ({pastTotal}) →
          </Link>
        )}
      </div>
    </div>
  );
}

function RecentlyEndedList({ requests }: { requests: Request[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? requests : requests.slice(0, 1);
  const moreCount = requests.length - shown.length;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Recently ended ({requests.length}) — auto-completes within 24h
      </p>
      {shown.map((r) => (
        <RecentlyEndedItem key={r.id} request={r} />
      ))}
      {moreCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-muted-foreground underline"
        >
          Show {moreCount} more
        </button>
      )}
    </div>
  );
}

function RecentlyEndedItem({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

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
    <div className="flex flex-col gap-2 border-t pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-medium">{request.coach.username}</span>
          {request.scheduledStartAt && (
            <span className="text-muted-foreground ml-2">
              {new Date(request.scheduledStartAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setShowDispute((v) => !v)}
          className="text-xs text-destructive underline"
        >
          Report issue
        </button>
      </div>
      {showDispute && (
        <div className="space-y-2">
          <Textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Describe what went wrong (at least 30 characters)..."
            maxLength={1000}
            rows={3}
          />
          <Button size="sm" variant="destructive" onClick={handleDispute} disabled={loading || disputeReason.trim().length < 30}>
            Submit report
          </Button>
        </div>
      )}
    </div>
  );
}

function StudentCard({ request }: { request: Request }) {
  if (request.status === "PENDING") return <PendingCard request={request} />;
  if (request.status === "ACCEPTED") return <StudentAcceptedCard request={request} />;
  if (request.status === "IN_PROGRESS") return <StudentActiveCard request={request} />;
  if (request.status === "DISPUTED") return <DisputedCard request={request} />;
  return null;
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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{request.coach.username}</span>
              <StatusBadge status={request.status} />
              {request.isTrial && <Badge variant="outline">Free trial</Badge>}
            </div>
            <RequestMeta request={request} />
          </div>
          <Button size="sm" variant="outline" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
        </div>
        {request.message && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium">Your message:</span> {request.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StudentAcceptedCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);
  const [declLoading, setDeclLoading] = useState(false);
  const now = useNow();
  const roomClosed = isRoomClosed(request.scheduledEndAt, now);
  const tooEarly = isBeforeJoinWindow(request.scheduledStartAt, now);

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
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{request.coach.username}</span>
              <StatusBadge status={request.status} roomClosed={roomClosed} />
              {request.isTrial && <Badge variant="outline">Free trial</Badge>}
            </div>
            <RequestMeta request={request} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {!roomClosed && !tooEarly && (
              <Link href={`/lesson/${request.id}`}>
                <Button size="sm">Join Room</Button>
              </Link>
            )}
            {!roomClosed && tooEarly && (
              <Button size="sm" disabled title="You can join 5 minutes before the lesson starts">
                Join Room
              </Button>
            )}
            {!roomClosed && !request.studentStartConfirmed && (
              <Button size="sm" variant="outline" onClick={handleConfirmStart} disabled={loading}>
                Confirm Start
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleDecline} disabled={declLoading}>
              Decline
            </Button>
          </div>
        </div>
        {!roomClosed && (
          <p className="text-xs text-muted-foreground">
            {request.studentStartConfirmed ? "✓ You confirmed" : "⏳ Waiting on you"}
            {" · "}
            {request.coachStartConfirmed ? "✓ Coach confirmed" : "⏳ Waiting on coach"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StudentActiveCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const now = useNow();
  const inGrace = isInGrace(request.scheduledEndAt, now);

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
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{request.coach.username}</span>
              <StatusBadge status={request.status} inGrace={inGrace} />
              {request.isTrial && <Badge variant="outline">Free trial</Badge>}
            </div>
            <RequestMeta request={request} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href={`/lesson/${request.id}`}>
              <Button size="sm">Join Room</Button>
            </Link>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setShowDispute(!showDispute)}>
              Report issue
            </Button>
          </div>
        </div>
        {showDispute && (
          <div className="space-y-2 border-t pt-3 mt-2">
            <Textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Describe what went wrong (at least 30 characters)..."
              maxLength={1000}
              rows={3}
            />
            <Button size="sm" variant="destructive" onClick={handleDispute} disabled={loading || disputeReason.trim().length < 30}>
              Submit report
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DisputedCard({ request }: { request: Request }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{request.coach.username}</span>
              <StatusBadge status={request.status} />
            </div>
            <RequestMeta request={request} />
            <p className="text-xs text-muted-foreground mt-1">
              An admin will review this dispute and contact you via email.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewBlock({ request }: { request: Request }) {
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleReview(formData: FormData) {
    const result = await submitReview(formData);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Review submitted!");
      setSaved(true);
      setShowReview(false);
    }
  }

  if (saved) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">
            How was your lesson with {request.coach.username}?
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rate your last completed lesson to help the community.
          </p>
        </div>
        {!showReview && (
          <Button size="sm" variant="outline" onClick={() => setShowReview(true)}>
            Leave a review
          </Button>
        )}
      </div>
      {showReview && (
        <form action={handleReview} className="space-y-2 border-t pt-3">
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
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" type="submit">Submit review</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowReview(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
