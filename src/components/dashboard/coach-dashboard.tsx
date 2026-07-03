"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { respondToLessonRequest, declineAcceptedLesson, submitReview, blockUser } from "@/lib/actions/lessons";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import { LessonCountdown } from "@/components/lesson-countdown";

const ROOM_GRACE_MS = 5 * 60 * 1000;
// Room opens 5 minutes before the scheduled start. Before that the
// /lesson/[id] page redirects away, so the join button shouldn't show.
const EARLY_JOIN_MS = 5 * 60 * 1000;

function isRoomClosed(scheduledEndAt: string | null, now: number): boolean {
  if (!scheduledEndAt) return false;
  return now > new Date(scheduledEndAt).getTime() + ROOM_GRACE_MS;
}

// Too early to join - the join window hasn't opened yet.
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
  studentConfirmed: boolean;
  coachConfirmed: boolean;
  studentId: string;
  disputeReason: string | null;
  createdAt: string;
  student: { username: string | null; chessComUsername: string | null };
  reviews: MyReview[];
}

const availabilityConfig: Record<string, { color: string; label: string }> = {
  AVAILABLE: { color: "bg-green-500", label: "Available" },
  UNAVAILABLE: { color: "bg-gray-400", label: "Unavailable" },
};

function StatusBadge({ status, roomClosed = false, inGrace = false }: { status: string; roomClosed?: boolean; inGrace?: boolean }) {
  if (status === "PENDING") return <Badge variant="secondary">Pending</Badge>;
  if (status === "ACCEPTED") {
    if (roomClosed) return <Badge variant="destructive">Missed</Badge>;
    return <Badge>Awaiting start</Badge>;
  }
  if (status === "IN_PROGRESS") {
    if (roomClosed) return <Badge variant="outline">Lesson ended · awaiting payout</Badge>;
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

export function CoachDashboard({
  requests,
  coachAvailability,
  isCoach,
  completedTotal,
  otherTotal,
  hasCompletedTrial,
  pendingTrialAutoCompletesAt = null,
  hasSchedule = true,
  hidePending = false,
}: {
  requests: Request[];
  coachAvailability: string;
  isCoach: boolean;
  completedTotal: number;
  otherTotal: number;
  hasCompletedTrial: boolean;
  pendingTrialAutoCompletesAt?: string | null;
  hasSchedule?: boolean;
  hidePending?: boolean;
}) {
  const now = useNow();
  const STATUS_ORDER: Record<string, number> = {
    IN_PROGRESS: 0,
    ACCEPTED: 1,
    PENDING: 2,
    DISPUTED: 3,
  };

  // Recently-ended (room closed, still IN_PROGRESS in DB) - pulled out of the
  // main list so they don't pile up. Coach just sees a one-liner count.
  const recentlyEnded = requests.filter(
    (r) => r.status === "IN_PROGRESS" && isRoomClosed(r.scheduledEndAt, now)
  );
  const recentlyEndedIds = new Set(recentlyEnded.map((r) => r.id));

  const active = requests
    .filter((r) => {
      if (!(r.status in STATUS_ORDER)) return false;
      if (hidePending && r.status === "PENDING") return false;
      if (recentlyEndedIds.has(r.id)) return false;
      return true;
    })
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
  const showTrialNotice = isCoach && !hasCompletedTrial;

  if (!isCoach) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Availability status */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
        coachAvailability === "AVAILABLE"
          ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30"
          : "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-950/30"
      }`}>
        <span className={`w-2.5 h-2.5 rounded-full ${availabilityConfig[coachAvailability]?.color ?? "bg-gray-400"}`} />
        <span className="font-medium">
          {availabilityConfig[coachAvailability]?.label ?? "Unknown"}
        </span>
        <span className="text-muted-foreground">
          {coachAvailability === "AVAILABLE"
            ? "- accepting requests"
            : "- students can't book new lessons"}
        </span>
      </div>

      {showTrialNotice && (
        pendingTrialAutoCompletesAt ? (
          <div className="p-3 rounded-lg border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-200">
              Free trial done - waiting for the student to confirm.
            </p>
            <p className="text-blue-800 dark:text-blue-300 mt-0.5">
              Paid bookings unlock as soon as they confirm, or automatically by{" "}
              {new Date(pendingTrialAutoCompletesAt).toLocaleString([], {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}{" "}
              if no issue is reported.
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Complete 1 free trial lesson to unlock paid bookings.
            </p>
          </div>
        )
      )}

      {coachAvailability === "AVAILABLE" && !hasSchedule && (
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            You haven&apos;t set up any weekly time slots yet.
          </p>
          <p className="text-amber-800 dark:text-amber-300 mt-0.5">
            Students can only book specific time slots, so you won&apos;t receive any
            bookings until you add availability under <span className="font-medium">Coaching</span> below.
          </p>
        </div>
      )}

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active lessons with students.</p>
      ) : (
        active.map((r) => <CoachCard key={r.id} request={r} />)
      )}

      {lastReviewable && (
        <Card>
          <CardContent>
            <ReviewBlock request={lastReviewable} />
          </CardContent>
        </Card>
      )}

      <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pt-2">
        {recentlyEnded.length > 0 && (
          <span>
            {recentlyEnded.length} recently ended · auto-completes within 24h
          </span>
        )}
        {pastTotal > 0 && (
          <Link href="/dashboard/history?role=coach" className="underline">
            View past lessons ({pastTotal}) →
          </Link>
        )}
      </div>
    </div>
  );
}

function CoachCard({ request }: { request: Request }) {
  if (request.status === "PENDING") return <PendingRequestCard request={request} />;
  if (request.status === "ACCEPTED") return <AcceptedLessonCard request={request} />;
  if (request.status === "IN_PROGRESS") return <ActiveLessonCard request={request} />;
  if (request.status === "DISPUTED") return <DisputedCard request={request} />;
  return null;
}

function PendingRequestCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  async function handleAccept() {
    setLoading(true);
    const result = await respondToLessonRequest(request.id, "accept");
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success("Accepted!");
  }

  async function handleDecline() {
    const reason = declineReason.trim();
    if (reason.length < 3) {
      toast.error("Please give a brief reason for declining.");
      return;
    }
    setLoading(true);
    const result = await respondToLessonRequest(request.id, "decline", reason);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Declined.");
      setDeclineOpen(false);
      setDeclineReason("");
    }
  }

  async function handleBlock() {
    setBlockLoading(true);
    const result = await blockUser(request.studentId);
    setBlockLoading(false);
    if (typeof result === "object" && "error" in result) toast.error(result.error);
    else toast.success("Student blocked.");
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{request.student.username}</span>
              <StatusBadge status={request.status} />
              {request.isTrial && <Badge variant="outline">Free trial</Badge>}
            </div>
            <RequestMeta request={request} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleAccept} disabled={loading}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeclineOpen(true)} disabled={loading}>
              Decline
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={handleBlock} disabled={blockLoading}>
              Block
            </Button>
          </div>
          <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Decline this request</DialogTitle>
                <DialogDescription>
                  Let {request.student.username ?? "the student"} know why you&apos;re declining.
                  This is shared with the student and kept on record.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. I'm fully booked this week, or this isn't a good fit for my coaching style."
                maxLength={500}
                rows={4}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleDecline} disabled={loading}>
                  Decline request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {request.message && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Message:</span> {request.message}
          </p>
        )}
        {request.scheduledStartAt && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            ⏰ Accepting commits you to be there. If you don&apos;t join within 10 minutes of
            the start, the student is refunded and your coach rating takes a penalty. Set a
            reminder.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AcceptedLessonCard({ request }: { request: Request }) {
  const [declLoading, setDeclLoading] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const now = useNow();
  const roomClosed = isRoomClosed(request.scheduledEndAt, now);
  const tooEarly = isBeforeJoinWindow(request.scheduledStartAt, now);
  // Declining after the start is server-rejected (no-show dodge), so hide the button.
  const started = request.scheduledStartAt
    ? now >= new Date(request.scheduledStartAt).getTime()
    : false;

  async function handleDecline() {
    const reason = declineReason.trim();
    if (reason.length < 3) {
      toast.error("Please give a brief reason for cancelling.");
      return;
    }
    setDeclLoading(true);
    const result = await declineAcceptedLesson(request.id, reason);
    setDeclLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Lesson cancelled.");
      setDeclineOpen(false);
      setDeclineReason("");
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{request.student.username}</span>
              <StatusBadge status={request.status} roomClosed={roomClosed} />
              {request.isTrial && <Badge variant="outline">Free trial</Badge>}
            </div>
            <RequestMeta request={request} />
            {request.scheduledStartAt && (
              <div className="mt-1.5">
                <LessonCountdown
                  scheduledStartAt={request.scheduledStartAt}
                  scheduledEndAt={request.scheduledEndAt}
                />
              </div>
            )}
            {request.scheduledStartAt && !started && (
              <p className="text-xs text-muted-foreground mt-1.5">
                ⏰ Set a reminder. Not joining counts as a no-show and penalizes your coach
                rating.
              </p>
            )}
            {roomClosed && (
              <p className="text-xs text-destructive mt-1.5">
                This lesson ended without being joined. It will be processed as a no-show.
              </p>
            )}
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
            {!started && (
              <Button size="sm" variant="ghost" onClick={() => setDeclineOpen(true)} disabled={declLoading}>
                Decline
              </Button>
            )}
          </div>
        </div>
        <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel this lesson</DialogTitle>
              <DialogDescription>
                Let {request.student.username ?? "the student"} know why you&apos;re cancelling.
                This is shared with the student and kept on record.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g. Something came up and I can't make this time."
              maxLength={500}
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={declLoading}>
                Keep lesson
              </Button>
              <Button onClick={handleDecline} disabled={declLoading}>
                Cancel lesson
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function ActiveLessonCard({ request }: { request: Request }) {
  const now = useNow();
  const inGrace = isInGrace(request.scheduledEndAt, now);
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{request.student.username}</span>
              <StatusBadge status={request.status} inGrace={inGrace} />
              {request.isTrial && <Badge variant="outline">Free trial</Badge>}
            </div>
            <RequestMeta request={request} />
          </div>
          <Link href={`/lesson/${request.id}`}>
            <Button size="sm">Join Room</Button>
          </Link>
        </div>
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
              <span className="font-medium">{request.student.username}</span>
              <StatusBadge status={request.status} />
            </div>
            <RequestMeta request={request} />
            {request.disputeReason && (
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-medium">Reason:</span> {request.disputeReason}
              </p>
            )}
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
            Rate {request.student.username}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Leave a quick review of your last completed lesson.
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

export { PendingRequestCard };
