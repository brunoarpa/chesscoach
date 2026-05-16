"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createLessonRequest } from "@/lib/actions/lessons";
import { toast } from "sonner";
import { Calendar, Clock } from "lucide-react";

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
}: Props) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [commMethod, setCommMethod] = useState<string>("");
  const [isTrial, setIsTrial] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [localSlots, setLocalSlots] = useState(slots);

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

  const canBook = selectedSlotId && (commMethod || isTrial) && (isTrial || (hasCompletedTrial && availableBalance >= slotPrice));

  async function handleBook() {
    if (!selectedSlotId) return;

    setLoading(true);
    const formData = new FormData();
    formData.set("coachId", coachId);
    formData.set("timeSlotId", selectedSlotId);
    if (isTrial) {
      formData.set("isTrial", "true");
    } else {
      formData.set("isTrial", "false");
      if (commMethod) formData.set("communicationMethod", commMethod);
    }
    if (message.trim()) formData.set("message", message.trim());

    const result = await createLessonRequest(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(isTrial ? "Free trial booked!" : "Lesson booked!");
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
        <CardContent className="py-8 text-center text-muted-foreground">
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
          Select a 15-minute time slot. Times shown in your local timezone.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
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
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
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
            {/* Trial option */}
            {freeTrialsRemaining > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant={isTrial ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setIsTrial(!isTrial);
                    if (!isTrial) setCommMethod("");
                  }}
                >
                  {isTrial ? "Free Trial ✓" : "Use Free Trial"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {freeTrialsRemaining} trial{freeTrialsRemaining !== 1 ? "s" : ""} left
                </span>
              </div>
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
                        Chat — €{(coachChatPrice / 100).toFixed(2)}/slot
                      </SelectItem>
                    )}
                    {canCall && (
                      <SelectItem value="CALL">
                        Call — €{(coachCallPrice! / 100).toFixed(2)}/slot
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Message */}
            <div className="space-y-1.5">
              <Label className="text-sm">Message (optional)</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Any specific topics you'd like to cover?"
                maxLength={500}
                rows={2}
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
                  <span className="font-semibold">€{(slotPrice / 100).toFixed(2)}</span>
                ) : null}
              </div>
            </div>

            {!isTrial && !hasCompletedTrial && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This coach hasn&apos;t completed a free trial yet — book a free trial first to unlock paid lessons with them.
              </p>
            )}

            {!isTrial && commMethod && availableBalance < slotPrice && (
              <p className="text-xs text-destructive">
                Insufficient balance. You have €{(availableBalance / 100).toFixed(2)} available.
              </p>
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
