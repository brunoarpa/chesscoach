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
}

export function LessonRequestForm({ coachId, coachPricePerHour, gameReviewPrice, availableBalance }: Props) {
  const [type, setType] = useState<string>("");
  const [duration, setDuration] = useState("");
  const [loading, setLoading] = useState(false);

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
      toast.success("Lesson request sent!");
      setType("");
      setDuration("");
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

          {estimatedCost > 0 && (
            <p className={`text-sm font-medium ${estimatedCost > availableBalance / 100 ? "text-destructive" : ""}`}>
              Estimated cost: ${estimatedCost.toFixed(2)}
              {estimatedCost > availableBalance / 100 && " — Insufficient balance"}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading || !type || !duration || (estimatedCost > 0 && estimatedCost > availableBalance / 100)}>
            {loading ? "Sending..." : "Send Request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
