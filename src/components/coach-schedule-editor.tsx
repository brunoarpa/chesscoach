"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveWeeklyTemplate } from "@/lib/actions/timeslots";
import { updateCoachAvailability, updateAcceptingFreeTrials } from "@/lib/actions/auth";
import { LESSON_DURATION_MINUTES, SLOT_START_MINUTES } from "@/lib/utils";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 - 23:00
const MINUTES = [...SLOT_START_MINUTES];

type SlotKey = string; // "dayOfWeek-hour-minute"

function makeKey(day: number, hour: number, minute: number): SlotKey {
  return `${day}-${hour}-${minute}`;
}

function parseKey(key: SlotKey): { dayOfWeek: number; startHour: number; startMinute: number } {
  const [d, h, m] = key.split("-").map(Number);
  return { dayOfWeek: d, startHour: h, startMinute: m };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

interface Props {
  initialTemplates: Array<{ dayOfWeek: number; startHour: number; startMinute: number }>;
  timezone: string | null;
  initialAvailability: string;
  initialAcceptingFreeTrials: boolean;
  // Coaches can only turn trials off once they've carried out their first one
  // (and thereby unlocked paid bookings). Before that the toggle is locked on.
  canToggleFreeTrials: boolean;
}

export function CoachScheduleEditor({ initialTemplates, timezone, initialAvailability, initialAcceptingFreeTrials, canToggleFreeTrials }: Props) {
  const [selected, setSelected] = useState<Set<SlotKey>>(() => {
    const set = new Set<SlotKey>();
    for (const t of initialTemplates) {
      set.add(makeKey(t.dayOfWeek, t.startHour, t.startMinute));
    }
    return set;
  });
  const [saving, setSaving] = useState(false);
  const [paused, setPaused] = useState(initialAvailability !== "AVAILABLE");
  const [pausing, setPausing] = useState(false);
  const [acceptingTrials, setAcceptingTrials] = useState(initialAcceptingFreeTrials);
  const [trialsSaving, setTrialsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragAction, setDragAction] = useState<"add" | "remove">("add");

  const handleMouseDown = useCallback((key: SlotKey) => {
    setIsDragging(true);
    const action = selected.has(key) ? "remove" : "add";
    setDragAction(action);
    setSelected((prev) => {
      const next = new Set(prev);
      if (action === "remove") {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, [selected]);

  const handleMouseEnter = useCallback((key: SlotKey) => {
    if (!isDragging) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (dragAction === "remove") {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, [isDragging, dragAction]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const selectAllDay = useCallback((day: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const hour of HOURS) {
        for (const minute of MINUTES) {
          next.add(makeKey(day, hour, minute));
        }
      }
      return next;
    });
  }, []);

  const clearDay = useCallback((day: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const hour of HOURS) {
        for (const minute of MINUTES) {
          next.delete(makeKey(day, hour, minute));
        }
      }
      return next;
    });
  }, []);

  async function handlePauseToggle() {
    const next = paused ? "AVAILABLE" : "UNAVAILABLE";
    setPausing(true);
    const result = await updateCoachAvailability(next);
    setPausing(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setPaused(next !== "AVAILABLE");
    toast.success(next === "AVAILABLE" ? "Bookings resumed." : "Bookings paused.");
  }

  async function handleTrialsToggle() {
    const next = !acceptingTrials;
    setTrialsSaving(true);
    const result = await updateAcceptingFreeTrials(next);
    setTrialsSaving(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setAcceptingTrials(next);
    toast.success(next ? "Now accepting free trials." : "Free trials turned off.");
  }

  async function handleSave() {
    setSaving(true);
    const slots = Array.from(selected).map(parseKey);
    const result = await saveWeeklyTemplate(slots);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Schedule saved! Slots generated for next 7 days.");
    }
  }

  return (
    <Card onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-lg">Weekly Availability</CardTitle>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={handlePauseToggle}
              disabled={pausing}
              size="sm"
              variant={paused ? "default" : "outline"}
              className="sm:w-auto w-full"
            >
              {pausing ? "Saving..." : paused ? "Resume bookings" : "Pause bookings"}
            </Button>
            <Button onClick={handleSave} disabled={saving} size="sm" className="sm:w-auto w-full">
              {saving ? "Saving..." : "Save Schedule"}
            </Button>
          </div>
        </div>
        {paused && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            Bookings are paused. Students can&apos;t book you and you won&apos;t show up
            for time-based searches. Your weekly schedule below is saved. Resume any time.
          </div>
        )}

        {/* Free trials toggle. Free trials are how new students try a coach, so
            we nudge coaches to keep them on - and lock the toggle on until the
            coach has carried out their first trial. */}
        <div className="rounded-md border px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Free trials {acceptingTrials ? "on" : "off"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {acceptingTrials
                ? "Free trials help you get students - they're the easiest way for someone to try you and become a paying student."
                : "You're not accepting new free trials. Turning them back on helps you get students, since a free trial is the easiest way for someone to try you out."}
            </p>
          </div>
          {canToggleFreeTrials ? (
            <Button
              onClick={handleTrialsToggle}
              disabled={trialsSaving}
              size="sm"
              variant={acceptingTrials ? "outline" : "default"}
              className="sm:w-auto w-full shrink-0"
            >
              {trialsSaving ? "Saving..." : acceptingTrials ? "Turn off free trials" : "Accept free trials"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground shrink-0">
              Unlocks after your first trial
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Tap a square to toggle a {LESSON_DURATION_MINUTES}-min slot, or drag across squares.{" "}
          {timezone ? (
            <>Times are in <span className="font-medium">{timezone}</span> (your profile timezone).</>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">
              Set your timezone in your profile before saving - otherwise slots can&apos;t be scheduled correctly.
            </span>
          )}
          <span className="sm:hidden block mt-1 text-xs">Tip: use All / Clear under each day to set a whole day at once.</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto sm:-mx-0">
          <div className="sm:min-w-[600px]">
            {/* Day headers */}
            <div className="grid grid-cols-[36px_repeat(7,1fr)] sm:grid-cols-[60px_repeat(7,1fr)] gap-0.5 mb-1">
              <div /> {/* empty corner */}
              {DAYS.map((day, i) => (
                <div key={day} className="text-center">
                  <span className="text-xs font-medium">{day}</span>
                  <div className="flex gap-0.5 justify-center mt-0.5">
                    <button
                      onClick={() => selectAllDay(i)}
                      className="text-xs text-blue-500 hover:underline"
                      type="button"
                    >
                      All
                    </button>
                    <button
                      onClick={() => clearDay(i)}
                      className="text-xs text-muted-foreground hover:underline"
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Time grid */}
            <div className="select-none">
              {HOURS.map((hour) =>
                MINUTES.map((minute) => (
                  <div
                    key={`${hour}-${minute}`}
                    className="grid grid-cols-[36px_repeat(7,1fr)] sm:grid-cols-[60px_repeat(7,1fr)] gap-0.5 mb-0.5"
                  >
                    {/* Time label - only show on :00 */}
                    <div className="flex items-center justify-end pr-1 sm:pr-2">
                      {minute === 0 && (
                        <span className="text-[10px] sm:text-xs text-muted-foreground tabular-nums">
                          {formatTime(hour, minute)}
                        </span>
                      )}
                    </div>

                    {/* Day cells */}
                    {DAYS.map((_, dayIndex) => {
                      const key = makeKey(dayIndex, hour, minute);
                      const isSelected = selected.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`h-6 sm:h-3 rounded-sm transition-colors ${
                            isSelected
                              ? "bg-green-500 hover:bg-green-600"
                              : "bg-muted hover:bg-muted-foreground/20"
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleMouseDown(key);
                          }}
                          onMouseEnter={() => handleMouseEnter(key)}
                        />
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            Available
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            Unavailable
          </div>
          <span className="ml-auto">{selected.size} slots ({(selected.size * LESSON_DURATION_MINUTES / 60).toFixed(1)}h/week)</span>
        </div>
      </CardContent>
    </Card>
  );
}
