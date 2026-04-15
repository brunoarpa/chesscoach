"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface Props {
  params: Record<string, string | undefined>;
  isLoggedIn?: boolean;
}

export function SearchFilters({ params, isLoggedIn }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function applyFilters(formData: FormData) {
    const newParams = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (value && value !== "" && value !== "any") {
        newParams.set(key, value as string);
      }
    }
    router.push(`/search?${newParams.toString()}`);
  }

  return (
    <form action={applyFilters} className="space-y-4">
      <div className="space-y-2">
        <Label>Search</Label>
        <Input
          name="q"
          placeholder="Username or name..."
          defaultValue={params.q}
        />
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
        <Label>Price per 5 min ($)</Label>
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
        <Label>Communication</Label>
        <Select name="communication" defaultValue={searchParams.get("communication") ?? ""}>
          <SelectTrigger>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="CHAT_ONLY">Chat Only</SelectItem>
            <SelectItem value="CHAT_AND_CALL">Chat & Call</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Availability</Label>
        <Select name="availability" defaultValue={searchParams.get("availability") ?? ""}>
          <SelectTrigger>
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="AVAILABLE">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Available
              </span>
            </SelectItem>
            <SelectItem value="BUSY">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                Busy
              </span>
            </SelectItem>
            <SelectItem value="UNAVAILABLE">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                Unavailable
              </span>
            </SelectItem>
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
