"use client";

import { useState } from "react";
import { MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { LANGUAGES } from "@/lib/languages";
import { updateProfile } from "@/lib/actions/auth";
import { toast } from "sonner";

interface Props {
  username: string;
  coachChatPrice?: number;
  coachCallPrice?: number;
  bio?: string;
  timezone?: string;
  languages: string[];
}

const languageOptions = LANGUAGES.map((l) => ({ value: l.code, label: l.label }));

// Pill switch matching the toggles used elsewhere in the app, sized up for the form.
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-green-500" : "bg-muted-foreground/30"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function ProfileEditForm(props: Props) {
  // A lesson type is offered when it has a price. The toggles make that explicit
  // instead of relying on a blank field to mean "not offered". When a toggle is
  // off we submit no price for that type, which clears it server-side.
  const [offersChat, setOffersChat] = useState(props.coachChatPrice != null);
  const [offersCall, setOffersCall] = useState(props.coachCallPrice != null);

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

          <div className="space-y-3">
            <div>
              <Label>Lessons you offer</Label>
              <p className="text-xs text-muted-foreground">
                Turn on each lesson type you teach and set its price per 30-minute
                lesson, in US dollars (USD).
              </p>
            </div>

            {/* Chat lessons */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Chat lessons</p>
                    <p className="text-xs text-muted-foreground">Text-based lessons in the lesson room.</p>
                  </div>
                </div>
                <Switch checked={offersChat} onChange={setOffersChat} label="Offer chat lessons" />
              </div>
              {offersChat && (
                <div className="space-y-1.5">
                  <Label htmlFor="coachChatPrice" className="text-xs">Price per 30 min (USD)</Label>
                  <Input
                    id="coachChatPrice"
                    name="coachChatPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={props.coachChatPrice}
                    placeholder="e.g. 2.00"
                    required
                  />
                </div>
              )}
            </div>

            {/* Audio-call lessons */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Audio-call lessons</p>
                    <p className="text-xs text-muted-foreground">Live voice lessons with a shared board.</p>
                  </div>
                </div>
                <Switch checked={offersCall} onChange={setOffersCall} label="Offer audio-call lessons" />
              </div>
              {offersCall && (
                <div className="space-y-1.5">
                  <Label htmlFor="coachCallPrice" className="text-xs">Price per 30 min (USD)</Label>
                  <Input
                    id="coachCallPrice"
                    name="coachCallPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={props.coachCallPrice}
                    placeholder="e.g. 5.00"
                    required
                  />
                </div>
              )}
            </div>
          </div>

          {/* Derived from the call toggle so booking, search, and the profile stay
              in sync with what the coach actually offers. */}
          <input
            type="hidden"
            name="communicationPreference"
            value={offersCall ? "CHAT_AND_CALL" : "CHAT_ONLY"}
          />

          <Button type="submit" className="w-full">
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
