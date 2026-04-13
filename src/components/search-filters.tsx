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

interface Props {
  params: Record<string, string | undefined>;
}

export function SearchFilters({ params }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function applyFilters(formData: FormData) {
    const newParams = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (value && value !== "") {
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
          <Input
            name="minRating"
            type="number"
            placeholder="Min"
            defaultValue={params.minRating}
          />
          <Input
            name="maxRating"
            type="number"
            placeholder="Max"
            defaultValue={params.maxRating}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Price per Hour ($)</Label>
        <div className="flex gap-2">
          <Input
            name="minPrice"
            type="number"
            step="0.01"
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
        <Label>Sort By</Label>
        <Select name="sort" defaultValue={searchParams.get("sort") ?? ""}>
          <SelectTrigger>
            <SelectValue placeholder="Coach ELO" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="elo">Coach ELO</SelectItem>
            <SelectItem value="price_asc">Price (Low to High)</SelectItem>
            <SelectItem value="price_desc">Price (High to Low)</SelectItem>
            <SelectItem value="rating">Chess Rating</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full">
        Apply Filters
      </Button>
    </form>
  );
}
