"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { LANGUAGES } from "@/lib/languages";
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
  coachChatPrice?: number;
  coachCallPrice?: number;
  communicationPreference: string;
  bio?: string;
  coachAvailability: string;
  timezone?: string;
  languages: string[];
}

const languageOptions = LANGUAGES.map((l) => ({ value: l.code, label: l.label }));

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
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              name="timezone"
              defaultValue={props.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
              placeholder="e.g. Europe/London"
            />
            <p className="text-xs text-muted-foreground">
              Your timezone for scheduling. Detected: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Languages</Label>
            <MultiSelect
              name="languages"
              options={languageOptions}
              defaultValue={props.languages}
              placeholder="Select languages you teach in…"
            />
            <p className="text-xs text-muted-foreground">
              Required to be available as a coach. Students can filter coaches by language.
            </p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="coachChatPrice">Chat lesson price per slot ($)</Label>
              <Input
                id="coachChatPrice"
                name="coachChatPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={props.coachChatPrice}
                placeholder="e.g. 2.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coachCallPrice">Call lesson price per slot ($)</Label>
              <Input
                id="coachCallPrice"
                name="coachCallPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={props.coachCallPrice}
                placeholder="e.g. 5.00"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Each slot is 15 minutes. Leave empty if not coaching that type.
          </p>

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
                <SelectItem value="CHAT_AND_CALL">Chat or Call</SelectItem>
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
                <SelectItem value="UNAVAILABLE">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                    Unavailable
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Available: accepting requests (requires a price). Unavailable: not accepting requests. If you&apos;re away from the site for 24h+, students temporarily see you as Unavailable until you return.
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
