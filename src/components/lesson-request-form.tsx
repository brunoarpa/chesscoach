"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createLessonRequest } from "@/lib/actions/lessons";
import { toast } from "sonner";

interface Props {
  coachId: string;
  coachChatPrice: number | null;
  coachCallPrice: number | null;
  coachCommunicationPreference: string;
  availableBalance: number;
  freeTrialsRemaining: number;
  hasCompletedPaidLesson: boolean;
  hasCompletedTrial?: boolean;
}

export function LessonRequestForm({ coachId, coachChatPrice, coachCallPrice, coachCommunicationPreference, availableBalance, freeTrialsRemaining, hasCompletedPaidLesson, hasCompletedTrial = true }: Props) {
  const [loading, setLoading] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [commMethod, setCommMethod] = useState<string>("");
  const [message, setMessage] = useState("");

  const hasPricing = coachChatPrice !== null || coachCallPrice !== null;

  const slotPrice = (() => {
    if (commMethod === "CALL" && coachCallPrice !== null) return coachCallPrice / 100;
    if (commMethod === "CHAT" && coachChatPrice !== null) return coachChatPrice / 100;
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
      setIsTrial(false);
      setCommMethod("");
      setMessage("");
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
            <Label>Communication Method</Label>
            <Select name="communicationMethod" value={commMethod} onValueChange={setCommMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {/* For free trials, show options based on coach preference (price not required).
                    For paid lessons, only show options where the coach has set a price. */}
                {(isTrial || coachChatPrice !== null) && (
                  <SelectItem value="CHAT">
                    {isTrial ? "Chat (free trial)" : `Chat ($${(coachChatPrice! / 100).toFixed(2)}/slot)`}
                  </SelectItem>
                )}
                {coachCommunicationPreference === "CHAT_AND_CALL" && (isTrial || coachCallPrice !== null) && (
                  <SelectItem value="CALL">
                    {isTrial ? "Call (free trial)" : `Call ($${(coachCallPrice! / 100).toFixed(2)}/slot)`}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Each slot is 15 minutes.</p>
          </div>

          <div className="space-y-2">
            <Label>Message for Coach (optional)</Label>
            <Textarea
              name="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introduce yourself, describe what you'd like to work on..."
              maxLength={500}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/500</p>
          </div>

          {!isTrial && commMethod && slotPrice > 0 && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price per 15-min slot</span>
                <span className="font-medium">${slotPrice.toFixed(2)}</span>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Your available balance: <span className="font-medium">${(availableBalance / 100).toFixed(2)}</span>
          </p>

          {isTrial ? (
            <p className="text-sm font-medium text-green-600">
              Free trial — no charge
            </p>
          ) : slotPrice > 0 ? (
            <p className={`text-sm font-medium ${slotPrice > availableBalance / 100 ? "text-destructive" : ""}`}>
              Cost per slot: ${slotPrice.toFixed(2)}
              {slotPrice > availableBalance / 100 && " — Insufficient balance"}
            </p>
          ) : null}

          {!isTrial && !hasCompletedTrial && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">&#9888;&#65039;</span>
              <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
                This coach hasn&apos;t completed a free trial yet. Book a free trial first to try them out — paid bookings unlock once they&apos;ve given one successful trial.
              </p>
            </div>
          )}

          {!isTrial && hasCompletedTrial && !hasCompletedPaidLesson && !warningDismissed && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">&#9888;&#65039;</span>
              <div className="flex-1">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  This coach hasn&apos;t completed any paid lessons yet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWarningDismissed(true)}
                className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 text-sm font-medium"
              >
                &#10005;
              </button>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !commMethod || (!isTrial && (!hasCompletedTrial || (slotPrice > 0 && slotPrice > availableBalance / 100)))}
          >
            {loading ? "Sending..." : isTrial ? "Send Free Trial Request" : "Send Request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
