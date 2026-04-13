"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateProfile } from "@/lib/actions/auth";

const continents = [
  { value: "AFRICA", label: "Africa" },
  { value: "ASIA", label: "Asia" },
  { value: "EUROPE", label: "Europe" },
  { value: "NORTH_AMERICA", label: "North America" },
  { value: "SOUTH_AMERICA", label: "South America" },
  { value: "OCEANIA", label: "Oceania" },
];

interface Props {
  continent: string | null;
  coachPricePerHour?: number;
  gameReviewPrice?: number;
  communicationPreference: string;
  bio?: string;
}

export function ProfileEditForm(props: Props) {
  async function handleSubmit(formData: FormData) {
    await updateProfile(formData);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Continent</Label>
            <Select name="continent" defaultValue={props.continent ?? undefined}>
              <SelectTrigger>
                <SelectValue placeholder="Select continent" />
              </SelectTrigger>
              <SelectContent>
                {continents.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              name="bio"
              defaultValue={props.bio}
              maxLength={500}
              placeholder="Tell others about your chess experience..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="coachPricePerHour">Price per Hour ($)</Label>
              <Input
                id="coachPricePerHour"
                name="coachPricePerHour"
                type="number"
                step="0.01"
                min="0"
                defaultValue={props.coachPricePerHour}
                placeholder="Leave empty if not coaching"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gameReviewPrice">Game Review Price ($)</Label>
              <Input
                id="gameReviewPrice"
                name="gameReviewPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={props.gameReviewPrice}
                placeholder="Per ~5 min review"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Communication Preference</Label>
            <Select
              name="communicationPreference"
              defaultValue={props.communicationPreference}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CHAT_ONLY">Chat Only</SelectItem>
                <SelectItem value="CHAT_AND_CALL">Chat &amp; Call</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full">
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
