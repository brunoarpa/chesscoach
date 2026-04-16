"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { respondToLessonRequest, confirmLesson, confirmLessonStart, declineAcceptedLesson, submitReview, blockStudent } from "@/lib/actions/lessons";
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
  communicationMethod: string | null;
  message: string | null;
  studentStartConfirmed: boolean;
  coachStartConfirmed: boolean;
  studentConfirmed: boolean;
  coachConfirmed: boolean;
  createdAt: string;
  student: { username: string; chessComUsername: string | null };
  reviews: MyReview[];
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

const availabilityConfig: Record<string, { color: string; label: string }> = {
  AVAILABLE: { color: "bg-green-500", label: "Available" },
  BUSY: { color: "bg-red-500", label: "Busy" },
  UNAVAILABLE: { color: "bg-gray-400", label: "Unavailable" },
};

function RequestMeta({ request }: { request: Request }) {
  return (
    <>
      <span className="text-sm text-muted-foreground ml-2">
        Lesson · {request.durationMinutes}min · {request.isTrial ? "Free" : `€${(request.estimatedCost / 100).toFixed(2)}`}
        {request.communicationMethod && ` · ${request.communicationMethod === "CALL" ? "Call" : "Chat"}`}
      </span>
      {request.isTrial && <Badge variant="secondary" className="ml-2">FREE TRIAL</Badge>}
    </>
  );
}

export function CoachDashboard({ requests, coachAvailability }: { requests: Request[]; coachAvailability: string }) {
  const pending = requests.filter((r) => r.status === "PENDING");
  const accepted = requests.filter((r) => r.status === "ACCEPTED");
  const inProgress = requests.filter((r) => r.status === "IN_PROGRESS");
  const disputed = requests.filter((r) => r.status === "DISPUTED");
  const completed = requests.filter((r) => r.status === "COMPLETED");
  const other = requests.filter(
    (r) => !["PENDING", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "DISPUTED"].includes(r.status)
  );

  return (
    <div className="space-y-8">
      {/* Availability status banner */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
        coachAvailability === "AVAILABLE"
          ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30"
          : coachAvailability === "BUSY"
          ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
          : "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-950/30"
      }`}>
        <span className={`w-3 h-3 rounded-full ${availabilityConfig[coachAvailability]?.color ?? "bg-gray-400"}`} />
        <span className="text-sm font-medium">
          {availabilityConfig[coachAvailability]?.label ?? "Unknown"}
        </span>
        <span className="text-sm text-muted-foreground">
          {coachAvailability === "AVAILABLE"
            ? "— You are accepting lesson requests"
            : coachAvailability === "BUSY"
            ? "— Students cannot send you new requests"
            : "— Students cannot send you new requests"}
        </span>
      </div>

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
          <h2 className="text-lg font-semibold mb-4">Awaiting Start</h2>
          <p className="text-sm text-muted-foreground mb-3">Both you and the student must confirm the lesson has started.</p>
          <div className="space-y-3">
            {accepted.map((r) => (
              <AcceptedLessonCard key={r.id} request={r} role="coach" />
            ))}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Active Lessons</h2>
          <div className="space-y-3">
            {inProgress.map((r) => (
              <ActiveLessonCard key={r.id} request={r} role="coach" />
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
                      <span className="font-medium">{r.student.username}</span>
                      <RequestMeta request={r} />
                    </div>
                    <Badge variant="destructive">Disputed — Under Review</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    The student has raised a dispute. An admin will review and may contact you via email or Chess.com.
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
                    <RequestMeta request={r} />
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
          <br />
          <a href="/how-it-works" className="underline text-sm mt-1 inline-block">
            Not sure where to start? Learn how it works
          </a>
        </p>
      )}
    </div>
  );
}

function PendingRequestCard({ request }: { request: Request }) {
  const [loading, setLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  async function handleRespond(action: "accept" | "decline") {
    setLoading(true);
    const result = await respondToLessonRequest(request.id, action);
    setLoading(false);
    if (result.error) toast.error(result.error);
    else toast.success(action === "accept" ? "Accepted!" : "Declined.");
  }

  async function handleBlock() {
    setBlockLoading(true);
    const result = await blockStudent(request.student.username);
    setBlockLoading(false);
    if (typeof result === "object" && "error" in result) toast.error(result.error);
    else toast.success("Student blocked.");
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{request.student.username}</span>
            <RequestMeta request={request} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleRespond("accept")} disabled={loading}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleRespond("decline")} disabled={loading}>
              Decline
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={handleBlock} disabled={blockLoading} title="Block student">
              Block
            </Button>
          </div>
        </div>
        {request.message && (
          <div className="mt-2 p-2 bg-muted rounded text-sm">
            <span className="text-xs text-muted-foreground">Message: </span>
            {request.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AcceptedLessonCard({ request, role }: { request: Request; role: "coach" | "student" }) {
  const [loading, setLoading] = useState(false);
  const [declLoading, setDeclLoading] = useState(false);
  const otherUser = role === "coach" ? request.student : (request as unknown as { coach: Request["student"] }).coach;
  const myStartConfirmed = role === "coach" ? request.coachStartConfirmed : request.studentStartConfirmed;
  const otherStartConfirmed = role === "coach" ? request.studentStartConfirmed : request.coachStartConfirmed;

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
    else toast.success("Lesson declined.");
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{otherUser.username}</span>
            <RequestMeta request={request} />
            {otherUser.chessComUsername && (
              <div className="text-sm mt-1">
                <a href={`https://www.chess.com/member/${otherUser.chessComUsername}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">Chess.com Profile ↗</a>
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {myStartConfirmed ? "✓ You confirmed start" : "⏳ Confirm when lesson starts"}
              {" · "}
              {otherStartConfirmed ? "✓ They confirmed start" : "⏳ Awaiting their start confirmation"}
            </div>
          </div>
          <div className="flex gap-2">
            {!myStartConfirmed && (
              <Button size="sm" onClick={handleConfirmStart} disabled={loading}>
                Confirm Start
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleDecline} disabled={declLoading}>
              Decline
            </Button>
          </div>
        </div>
        {request.message && (
          <div className="mt-2 p-2 bg-muted rounded text-sm">
            <span className="text-xs text-muted-foreground">Message: </span>
            {request.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveLessonCard({ request, role }: { request: Request; role: "coach" | "student" }) {
  const [loading, setLoading] = useState(false);
  const otherUser = role === "coach" ? request.student : (request as unknown as { coach: Request["student"] }).coach;
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
            <RequestMeta request={request} />
            {otherUser.chessComUsername && (
              <div className="text-sm mt-1">
                <a href={`https://www.chess.com/member/${otherUser.chessComUsername}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">Chess.com Profile ↗</a>
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {myConfirmed ? "✓ You confirmed completion" : "⏳ Awaiting your confirmation"}
              {" · "}
              {otherConfirmed ? "✓ They confirmed completion" : "⏳ Awaiting their confirmation"}
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
            <span className="font-medium">{otherUser.username}</span>
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

export { AcceptedLessonCard, ActiveLessonCard, CompletedCard };
