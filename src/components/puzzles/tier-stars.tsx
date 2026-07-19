import { Star } from "lucide-react";
import { MAX_DIFFICULTY } from "@/lib/puzzles";
import { cn } from "@/lib/utils";

// Difficulty reads as filled stars everywhere it appears. A "3/5" tells you the
// same thing but you have to parse it; the stars land instantly.
export function TierStars({
  difficulty,
  className,
  size = "sm",
}: {
  difficulty: number;
  className?: string;
  size?: "sm" | "lg";
}) {
  const px = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      aria-label={`Difficulty ${difficulty} out of ${MAX_DIFFICULTY}`}
    >
      {Array.from({ length: MAX_DIFFICULTY }).map((_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            px,
            i < difficulty ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
}
