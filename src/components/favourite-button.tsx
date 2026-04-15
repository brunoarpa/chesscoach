"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { toggleFavourite } from "@/lib/actions/lessons";
import { toast } from "sonner";

interface Props {
  coachId: string;
  initialFavourited: boolean;
}

export function FavouriteButton({ coachId, initialFavourited }: Props) {
  const [favourited, setFavourited] = useState(initialFavourited);
  const [loading, setLoading] = useState(false);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    const result = await toggleFavourite(coachId);
    setLoading(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      setFavourited(result.favourited);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className="p-1 rounded-full hover:bg-muted transition-colors"
      title={favourited ? "Remove from favourites" : "Add to favourites"}
    >
      <Heart
        className={`h-4 w-4 transition-colors ${
          favourited ? "fill-red-500 text-red-500" : "text-muted-foreground"
        }`}
      />
    </button>
  );
}
