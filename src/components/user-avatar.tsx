import Image from "next/image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Rendered pixel size per avatar size. We fetch at 2x for retina sharpness;
// next/image resizes the source down to this instead of shipping the full
// upload. Keep in sync with the size-* classes in components/ui/avatar.tsx.
const SIZE_PX = { sm: 24, default: 32, lg: 40, xl: 56 } as const;

// Hosts configured in next.config images.remotePatterns. Only these can go
// through next/image; anything else falls back to a plain <img> so an
// unexpected image host can never throw and break the page render.
const OPTIMIZED_HOSTS = [
  "public.blob.vercel-storage.com",
  "lh3.googleusercontent.com",
  "images.chesscomfiles.com",
];

function canOptimize(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return OPTIMIZED_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

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
  const px = SIZE_PX[size];
  return (
    <Avatar size={size} className={className}>
      {/* Initials tile sits underneath: it shows while the photo loads and if
          the photo ever fails, so the avatar is never blank. */}
      <AvatarFallback className={cn(tintFor(username ?? "?"))}>
        {initials(username)}
      </AvatarFallback>
      {image &&
        (canOptimize(image) ? (
          <Image
            src={image}
            alt={username ?? ""}
            width={px * 2}
            height={px * 2}
            className="absolute inset-0 z-10 size-full rounded-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={username ?? ""}
            className="absolute inset-0 z-10 size-full rounded-full object-cover"
          />
        ))}
    </Avatar>
  );
}
