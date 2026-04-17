"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateProfile } from "@/lib/actions/auth";
import { toast } from "sonner";

const continents = [
  { value: "AFRICA", label: "Africa" },
  { value: "ASIA", label: "Asia" },
  { value: "EUROPE", label: "Europe" },
  { value: "NORTH_AMERICA", label: "North America" },
  { value: "SOUTH_AMERICA", label: "South America" },
  { value: "OCEANIA", label: "Oceania" },
];

interface Props {
  username: string;
  continent: string | null;
  coachPricePer5Min?: number;
  communicationPreference: string;
  bio?: string;
  coachAvailability: string;
}

export function ProfileEditForm(props: Props) {
  async function handleSubmit(formData: FormData) {
    const result = await updateProfile(formData);
    if (result?.error) {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              defaultValue={props.username}
              minLength={3}
              maxLength={20}
              pattern="^[a-zA-Z0-9_]+$"
              required
            />
            <p className="text-xs text-muted-foreground">
              3-20 characters. Letters, numbers, and underscores only.
            </p>
          </div>
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
              <Label htmlFor="coachPricePer5Min">Price per 5 min (€)</Label>
              <Input
                id="coachPricePer5Min"
                name="coachPricePer5Min"
                type="number"
                step="0.01"
                min="0"
                defaultValue={props.coachPricePer5Min}
                placeholder="Leave empty if not coaching"
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

          <div className="space-y-2">
            <Label>Coaching Availability</Label>
            <Select
              name="coachAvailability"
              defaultValue={props.coachAvailability}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AVAILABLE">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                    Available
                  </span>
                </SelectItem>
                <SelectItem value="BUSY">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    Busy
                  </span>
                </SelectItem>
                <SelectItem value="UNAVAILABLE">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                    Unavailable
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Available: accepting requests (requires a price). Busy: visible but not accepting requests. Unavailable: not accepting requests. You are automatically set to unavailable after 24 hours of inactivity — you must manually set yourself back to available.
            </p>
          </div>

          <Button type="submit" className="w-full">
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
