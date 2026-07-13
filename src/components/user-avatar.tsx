import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Deterministic fallback tints so a coach without a photo still gets a stable,
// recognisable colour instead of a sea of identical grey circles.
const FALLBACK_TINTS = [
  "bg-red-500/15 text-red-700 dark:text-red-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-green-500/15 text-green-700 dark:text-green-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
];

function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return FALLBACK_TINTS[Math.abs(hash) % FALLBACK_TINTS.length];
}

function initials(username?: string | null): string {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}

interface Props {
  username?: string | null;
  image?: string | null;
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
}

/**
 * Shared avatar for a person (coach or student): shows their picture when we
 * have one, otherwise a deterministically-coloured initials tile.
 */
export function UserAvatar({ username, image, size = "default", className }: Props) {
  return (
    <Avatar size={size} className={className}>
      {image && <AvatarImage src={image} alt={username ?? ""} />}
      <AvatarFallback className={cn(tintFor(username ?? "?"))}>
        {initials(username)}
      </AvatarFallback>
    </Avatar>
  );
}
