"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLessonRequest } from "@/lib/actions/lessons";
import { toast } from "sonner";

interface Props {
  coachId: string;
  coachPricePerHour: number | null;
  gameReviewPrice: number | null;
  availableBalance: number;
  freeTrialsRemaining: number;
  hasCompletedPaidLesson: boolean;
}

export function LessonRequestForm({ coachId, coachPricePerHour, gameReviewPrice, availableBalance, freeTrialsRemaining, hasCompletedPaidLesson }: Props) {
  const [type, setType] = useState<string>("");
  const [duration, setDuration] = useState("");
  const [loading, setLoading] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);

  const hasPricing = coachPricePerHour !== null || gameReviewPrice !== null;

  const estimatedCost = (() => {
    const mins = Number(duration);
    if (!mins) return 0;
    if (type === "GAME_REVIEW" && gameReviewPrice) {
      return (gameReviewPrice * Math.ceil(mins / 5)) / 100;
    }
    if (type === "LESSON" && coachPricePerHour) {
      return (coachPricePerHour * mins) / 60 / 100;
    }
    return 0;
  })();

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await createLessonRequest(formData);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(isTrial ? "Free trial request sent!" : "Lesson request sent!");
      setType("");
      setDuration("");
      setIsTrial(false);
    }
  }

  if (!hasPricing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request a Lesson</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This coach hasn&apos;t set their pricing yet. Check back later!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Request a Lesson</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="coachId" value={coachId} />
          <input type="hidden" name="isTrial" value={isTrial ? "true" : "false"} />

          {freeTrialsRemaining > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <input
                type="checkbox"
                id="isTrial"
                checked={isTrial}
                onChange={(e) => setIsTrial(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="isTrial" className="text-sm flex-1">
                <span className="font-medium">Use free trial</span>
                <span className="text-muted-foreground ml-1">({freeTrialsRemaining} remaining)</span>
              </label>
            </div>
          )}

          <div className="space-y-2">
            <Label>Type</Label>
            <Select name="type" value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {coachPricePerHour && (
                  <SelectItem value="LESSON">
                    Lesson (${(coachPricePerHour / 100).toFixed(2)}/hr)
                  </SelectItem>
                )}
                {gameReviewPrice && (
                  <SelectItem value="GAME_REVIEW">
                    Game Review (${(gameReviewPrice / 100).toFixed(2)} per ~5min)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input
              name="durationMinutes"
              type="number"
              min={5}
              max={480}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={type === "GAME_REVIEW" ? "5" : "60"}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Your available balance: <span className="font-medium">${(availableBalance / 100).toFixed(2)}</span>
          </p>

          {isTrial ? (
            <p className="text-sm font-medium text-green-600">
              Free trial — no charge
            </p>
          ) : estimatedCost > 0 ? (
            <p className={`text-sm font-medium ${estimatedCost > availableBalance / 100 ? "text-destructive" : ""}`}>
              Estimated cost: ${estimatedCost.toFixed(2)}
              {estimatedCost > availableBalance / 100 && " — Insufficient balance"}
            </p>
          ) : null}

          {!isTrial && !hasCompletedPaidLesson && !warningDismissed && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">⚠️</span>
              <div className="flex-1">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  This coach hasn&apos;t completed any paid lessons yet. They may be new to coaching on ChessCoach.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWarningDismissed(true)}
                className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 text-sm font-medium"
              >
                ✕
              </button>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !type || !duration || (!isTrial && estimatedCost > 0 && estimatedCost > availableBalance / 100)}
          >
            {loading ? "Sending..." : isTrial ? "Send Free Trial Request" : "Send Request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
