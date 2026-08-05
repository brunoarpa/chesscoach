"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createLessonRequest } from "@/lib/actions/lessons";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
import { Calendar, CheckCircle2, Clock } from "lucide-react";

interface Slot {
  id: string;
  startTime: string; // ISO string
  endTime: string;
}

interface Props {
  coachId: string;
  coachChatPrice: number | null;
  coachCallPrice: number | null;
  coachCommunicationPreference: string;
  availableBalance: number;
  freeTrialsRemaining: number;
  slots: Slot[];
  hasCompletedTrial?: boolean;
  coachAcceptingFreeTrials?: boolean;
  // When false, the visitor is logged out: they can pick a slot and everything
  // else, but hitting "Book" sends them to sign in first (deferred auth gate).
  isAuthenticated?: boolean;
  coachUsername: string;
}

type GroupedSlots = Record<string, Slot[]>;

function groupSlotsByDate(slots: Slot[]): GroupedSlots {
  const groups: GroupedSlots = {};
  for (const slot of slots) {
    const date = new Date(slot.startTime).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(slot);
  }
  return groups;
}

function formatSlotTime(startTime: string): string {
  return new Date(startTime).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function SlotPicker({
  coachId,
  coachChatPrice,
  coachCallPrice,
  coachCommunicationPreference,
  availableBalance,
  freeTrialsRemaining,
  slots,
  hasCompletedTrial = true,
  coachAcceptingFreeTrials = true,
  isAuthenticated = true,
  coachUsername,
}: Props) {
  const router = useRouter();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [commMethod, setCommMethod] = useState<string>("");
  const [isTrial, setIsTrial] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [localSlots, setLocalSlots] = useState(slots);
  const [lastBookedSlot, setLastBookedSlot] = useState<{ startTime: string; isTrial: boolean } | null>(null);

  useEffect(() => {
    setLocalSlots(slots);
  }, [slots]);

  const grouped = groupSlotsByDate(localSlots);
  const hasSlots = localSlots.length > 0;
  const canCall = coachCommunicationPreference === "CHAT_AND_CALL" && coachCallPrice !== null;

  const slotPrice = (() => {
    if (isTrial) return 0;
    if (commMethod === "CALL" && coachCallPrice !== null) return coachCallPrice;
    if (commMethod === "CHAT" && coachChatPrice !== null) return coachChatPrice;
    return 0;
  })();

  // Logged-out visitors only need a slot and a type to proceed: the balance and
  // trial-history gates are checked server-side after they sign in.
  const canBook =
    selectedSlotId &&
    (commMethod || isTrial) &&
    (!isAuthenticated || isTrial || (hasCompletedTrial && availableBalance >= slotPrice));

  async function handleBook() {
    if (!selectedSlotId) return;

    // The student committed to a slot and hit book - the top of the booking
    // funnel, fired before the request is sent (and before it can fail).
    track("lesson_booking_start", {
      lesson_type: isTrial ? "trial" : commMethod === "CALL" ? "call" : "chat",
    });

    // Deferred auth: a logged-out visitor has now picked everything. Send them
    // to sign in, then straight back to this coach to finish booking.
    if (!isAuthenticated) {
      router.push(`/login?callbackUrl=/profile/${coachUsername}`);
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.set("coachId", coachId);
    formData.set("timeSlotId", selectedSlotId);
    if (isTrial) {
      formData.set("isTrial", "true");
    } else {
      formData.set("isTrial", "false");
      if (commMethod) formData.set("communicationMethod", commMethod);
      // The price the student is looking at right now - the server rejects the
      // booking if the coach has since changed it.
      formData.set("expectedPrice", String(slotPrice));
    }
    if (message.trim()) formData.set("message", message.trim());

    const result = await createLessonRequest(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      const bookedSlot = localSlots.find((s) => s.id === selectedSlotId);
      const lessonType = isTrial ? "trial" : commMethod === "CALL" ? "call" : "chat";
      track("booking_created", { lesson_type: lessonType, value: slotPrice / 100, currency: "USD" });
      // Paid bookings commit the student's money (reserved from wallet now,
      // debited on completion) - the revenue-intent step of the funnel.
      if (!isTrial) {
        track("lesson_paid", { lesson_type: lessonType, value: slotPrice / 100, currency: "USD" });
      }
      toast.success(isTrial ? "Free trial request sent!" : "Lesson request sent!");
      if (bookedSlot) {
        setLastBookedSlot({ startTime: bookedSlot.startTime, isTrial });
      }
      // Remove the booked slot from local state
      setLocalSlots((prev) => prev.filter((s) => s.id !== selectedSlotId));
      setSelectedSlotId(null);
      setCommMethod("");
      setMessage("");
      setIsTrial(false);
    }
  }

  if (!hasSlots) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground space-y-3">
          {lastBookedSlot && (
            <div className="rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30 p-3 text-left">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-green-900 dark:text-green-200">
                    {lastBookedSlot.isTrial ? "Free trial request sent" : "Lesson request sent"}
                  </p>
                  <p className="text-green-800 dark:text-green-300 mt-0.5">
                    Waiting for the coach to accept.
                  </p>
                  <Link href="/dashboard" className="block mt-2">
                    <Button size="sm" variant="outline" className="w-full">
                      View status in your dashboard →
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
          <Calendar className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p>No available time slots this week.</p>
          <p className="text-sm mt-1">Check back later or try a different coach.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Book a Lesson</CardTitle>
        <p className="text-sm text-muted-foreground">
          Select a 30-minute time slot. Times shown in your local timezone.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastBookedSlot && (
          <div className="rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-green-900 dark:text-green-200">
                  {lastBookedSlot.isTrial ? "Free trial request sent" : "Lesson request sent"}
                </p>
                <p className="text-green-800 dark:text-green-300 mt-0.5">
                  Waiting for the coach to accept your request for{" "}
                  <span className="font-medium">
                    {new Date(lastBookedSlot.startTime).toLocaleString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  .
                </p>
                <p className="text-green-800 dark:text-green-300 mt-1">
                  ⏰ Add it to your calendar now. Missed lessons count as no-shows and are
                  still charged.
                </p>
              </div>
            </div>
            <Link href="/dashboard" className="block">
              <Button size="sm" variant="outline" className="w-full">
                View status in your dashboard →
              </Button>
            </Link>
          </div>
        )}

        {/* Booking type - kept above the times so the student picks free trial
            vs chat/call without scrolling past a long list of slots. */}
        <div className="space-y-3">
          {/* Trial option - a switch so the on/off state is obvious at a glance,
              with the "(chat)" detail inline instead of a sentence below. */}
          {freeTrialsRemaining > 0 && coachAcceptingFreeTrials && (
            <button
              type="button"
              role="switch"
              aria-checked={isTrial}
              onClick={() => {
                setIsTrial(!isTrial);
                if (!isTrial) setCommMethod("");
              }}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
            >
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  isTrial ? "bg-green-600" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    isTrial ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </span>
              <span className="flex-1 text-sm font-medium">
                Use a free trial{" "}
                <span className="font-normal text-muted-foreground">(chat)</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {freeTrialsRemaining} left
              </span>
            </button>
          )}

          {/* Communication method */}
          {!isTrial && (
            <div className="space-y-1.5">
              <Label className="text-sm">Lesson Type</Label>
              <Select value={commMethod} onValueChange={setCommMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose chat or call" />
                </SelectTrigger>
                <SelectContent>
                  {coachChatPrice !== null && (
                    <SelectItem value="CHAT">
                      Chat - ${(coachChatPrice / 100).toFixed(2)} / 30 min
                    </SelectItem>
                  )}
                  {canCall && (
                    <SelectItem value="CALL">
                      Call - ${(coachCallPrice! / 100).toFixed(2)} / 30 min
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Slot grid grouped by day */}
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {Object.entries(grouped).map(([date, daySlots]) => (
            <div key={date}>
              <h4 className="text-sm font-medium mb-1.5 sticky top-0 bg-background py-1">{date}</h4>
              <div className="flex flex-wrap gap-1.5">
                {daySlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setSelectedSlotId(selectedSlotId === slot.id ? null : slot.id)}
                    className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                      selectedSlotId === slot.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted-foreground/20"
                    }`}
                  >
                    <Clock className="inline-block w-3 h-3 mr-1" />
                    {formatSlotTime(slot.startTime)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Booking options (show when slot selected) */}
        {selectedSlotId && (
          <div className="border-t pt-4 space-y-3">
            {/* Message */}
            <div className="space-y-1.5">
              <Label className="text-sm">What do you want from this lesson? (optional)</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. review my recent games"
                maxLength={500}
                rows={3}
              />
            </div>

            {/* Price summary */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isTrial ? "Free trial" : commMethod ? `${commMethod === "CALL" ? "Call" : "Chat"} lesson` : "Select type"}
              </span>
              <div className="flex items-center gap-2">
                {isTrial ? (
                  <Badge variant="secondary">FREE</Badge>
                ) : commMethod ? (
                  <span className="font-semibold">${(slotPrice / 100).toFixed(2)}</span>
                ) : null}
              </div>
            </div>

            {isAuthenticated && !isTrial && !hasCompletedTrial && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                This coach hasn&apos;t completed a free trial yet. Book a free trial first to unlock paid lessons with them.
              </p>
            )}

            {isAuthenticated && !isTrial && commMethod && availableBalance < slotPrice && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm space-y-2">
                <p className="text-destructive">
                  Insufficient balance - you have ${(availableBalance / 100).toFixed(2)}, need ${(slotPrice / 100).toFixed(2)}.
                </p>
                <Link href="/wallet">
                  <Button size="sm" variant="outline" className="w-full">
                    Add funds to your wallet →
                  </Button>
                </Link>
              </div>
            )}

            <Button
              onClick={handleBook}
              disabled={!canBook || loading}
              className="w-full"
            >
              {loading ? "Booking..." : isTrial ? "Book Free Trial" : "Book Lesson"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
