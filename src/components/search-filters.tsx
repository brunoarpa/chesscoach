"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { LANGUAGES } from "@/lib/languages";
import { LESSON_DURATION_MS } from "@/lib/utils";

const continents = [
  { value: "", label: "All" },
  { value: "AFRICA", label: "Africa" },
  { value: "ASIA", label: "Asia" },
  { value: "EUROPE", label: "Europe" },
  { value: "NORTH_AMERICA", label: "N. America" },
  { value: "SOUTH_AMERICA", label: "S. America" },
  { value: "OCEANIA", label: "Oceania" },
];

const ratingOptions = Array.from({ length: 30 }, (_, i) => (i + 1) * 100); // 100 to 3000

const languageOptions = LANGUAGES.map((l) => ({ value: l.code, label: l.label }));

const SLOT_MS = LESSON_DURATION_MS;

// Format a Date as the `YYYY-MM-DDTHH:mm` wall-clock string a datetime-local input expects.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Round to the next/previous slot boundary (:00/:30) so the picker aligns with
// bookable slots. All real-world UTC offsets are multiples of 30 min, so rounding
// the absolute instant keeps the local wall-clock value slot-aligned too.
function roundUpToSlot(d: Date): Date {
  return new Date(Math.ceil(d.getTime() / SLOT_MS) * SLOT_MS);
}

function roundDownToSlot(d: Date): Date {
  return new Date(Math.floor(d.getTime() / SLOT_MS) * SLOT_MS);
}

function paramToLocalInput(raw: string | null): string {
  if (!raw) return "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : toLocalInputValue(d);
}

interface Props {
  params: Record<string, string | undefined>;
  isLoggedIn?: boolean;
}

export function SearchFilters({ params, isLoggedIn }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Booking window: now (rounded down) through one week ahead (rounded up). Slots only
  // open that far out. Picks earlier than the present are clamped up at submit time, so
  // the loose lower bound never errors the user.
  const [bookingBounds] = useState(() => {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { min: toLocalInputValue(roundDownToSlot(now)), max: toLocalInputValue(roundUpToSlot(weekAhead)) };
  });

  const availableFromDefault = paramToLocalInput(searchParams.get("availableFrom"));
  const availableToDefault = paramToLocalInput(searchParams.get("availableTo"));

  // The advanced filters start collapsed to keep the panel uncluttered, but open
  // automatically when one of them is already active so a hidden filter is never
  // silently applied.
  const [showMore, setShowMore] = useState(() =>
    Boolean(
      searchParams.get("availableFrom") ||
        searchParams.get("availableTo") ||
        (searchParams.get("continent") && searchParams.get("continent") !== "all") ||
        (searchParams.get("communication") && searchParams.get("communication") !== "any") ||
        (searchParams.get("lastSeen") && searchParams.get("lastSeen") !== "any"),
    ),
  );

  function applyFilters(formData: FormData) {
    const newParams = new URLSearchParams();
    const now = new Date();
    // The datetime-local picks are wall-clock in the student's timezone; convert to
    // absolute UTC instants so the server can match them against stored slot times.
    let fromIso: string | null = null;
    let toIso: string | null = null;
    for (const [key, value] of formData.entries()) {
      if (!value || value === "" || value === "any") continue;
      if (key === "availableFrom" || key === "availableTo") {
        const d = new Date(value as string);
        if (Number.isNaN(d.getTime())) continue;
        // A pick before now just means "from now"; clamp up instead of erroring.
        // Slots always start on 30-min boundaries, so round up to the next
        // half-hour (16:19 -> 16:30). Users needn't enter exact multiples.
        const effective = d.getTime() < now.getTime() ? now : d;
        const iso = roundUpToSlot(effective).toISOString();
        if (key === "availableFrom") fromIso = iso;
        else toIso = iso;
        continue;
      }
      newParams.append(key, value as string);
    }
    // Keep the range valid even if the user picks the ends in reverse order.
    if (fromIso && toIso && fromIso > toIso) {
      [fromIso, toIso] = [toIso, fromIso];
    }
    if (fromIso) newParams.append("availableFrom", fromIso);
    if (toIso) newParams.append("availableTo", toIso);
    router.push(`/search?${newParams.toString()}`);
  }

  return (
    <form action={applyFilters} className="space-y-4">
      {/* Primary filters: the ones most students choose a coach by. */}
      <div className="space-y-2">
        <Label>Search</Label>
        <Input
          name="q"
          placeholder="Username or name..."
          defaultValue={params.q}
        />
      </div>

      <div className="space-y-2">
        <Label>Price per 30 min ($)</Label>
        <div className="flex gap-2">
          <Input
            name="minPrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="Min"
            defaultValue={params.minPrice}
          />
          <Input
            name="maxPrice"
            type="number"
            step="0.01"
            placeholder="Max"
            defaultValue={params.maxPrice}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Chess Rating</Label>
        <div className="flex gap-2">
          <Select name="minRating" defaultValue={searchParams.get("minRating") ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder="Min" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {ratingOptions.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select name="maxRating" defaultValue={searchParams.get("maxRating") ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder="Max" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {ratingOptions.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Languages</Label>
        <MultiSelect
          name="languages"
          options={languageOptions}
          defaultValue={searchParams.getAll("languages")}
          placeholder="Any"
        />
      </div>

      {/* Advanced filters: collapsed by default. Kept mounted (just hidden) so
          their values still submit even while the section is closed. */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={showMore}
      >
        More filters
        <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`} />
      </button>

      <div className={showMore ? "space-y-4" : "hidden"}>
        <div className="space-y-2">
          <Label>Available between</Label>
          <div className="space-y-2">
            <Input
              type="datetime-local"
              name="availableFrom"
              min={bookingBounds.min}
              max={bookingBounds.max}
              defaultValue={availableFromDefault}
              aria-label="Available from"
            />
            <Input
              type="datetime-local"
              name="availableTo"
              min={bookingBounds.min}
              max={bookingBounds.max}
              defaultValue={availableToDefault}
              aria-label="Available until"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Continent</Label>
          <Select name="continent" defaultValue={searchParams.get("continent") ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {continents.map((c) => (
                <SelectItem key={c.value || "all"} value={c.value || "all"}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Communication</Label>
          <Select name="communication" defaultValue={searchParams.get("communication") ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="CHAT_ONLY">Chat Only</SelectItem>
              <SelectItem value="CHAT_AND_CALL">Chat or Call</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Last Seen</Label>
          <Select name="lastSeen" defaultValue={searchParams.get("lastSeen") ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="1h">Last hour</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" className="w-full">
        Apply Filters
      </Button>

      {isLoggedIn && (
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="favourites"
            name="favourites"
            value="true"
            defaultChecked={params.favourites === "true"}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="favourites" className="text-sm">Favourites only</label>
        </div>
      )}
    </form>
  );
}
