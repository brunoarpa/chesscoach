import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Phone, BookOpen, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { FavouriteButton } from "@/components/favourite-button";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { getLanguageLabel } from "@/lib/languages";

import { getActivityDotColor } from "@/lib/utils";

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

// One stat row: an icon in a fixed-width slot so labels align in a column, plus
// a value that dims when it's a placeholder ("Unrated", "No call lessons", ...).
function Stat({ icon, children, muted = false }: { icon: ReactNode; children: ReactNode; muted?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${muted ? "text-muted-foreground/70" : ""}`}>
      <span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
      {children}
    </span>
  );
}

interface Props {
  id: string;
  username: string;
  chessRating: number | null;
  coachChatPrice: number | null;
  coachCallPrice: number | null;
  communicationPreference: string;
  activityStatus: string;
  coachAvailability: string;
  bookable: boolean;
  hasOpenSlots: boolean;
  acceptingFreeTrials?: boolean;
  lastActiveAt: Date;
  avgRating: number | null;
  reviewCount: number;
  lessonsGiven: number;
  bio: string | null;
  languages: string[];
  isFavourited?: boolean;
  showFavourite?: boolean;
}

export function CoachCard(props: Props) {
  return (
    <div className="relative h-full">
      {props.showFavourite && (
        <div className="absolute top-2 right-2 z-10">
          <FavouriteButton coachId={props.id} initialFavourited={props.isFavourited ?? false} />
        </div>
      )}
      <Link href={`/profile/${props.username}`} className="block h-full">
        <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">{props.username}</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-3">
              <span className="flex items-center gap-1.5">
                ♝ Chess Coach
                <BookingStatusBadge bookable={props.bookable} hasOpenSlots={props.hasOpenSlots} acceptingFreeTrials={props.acceptingFreeTrials} />
              </span>
            </p>

            {/* Fixed two-line height so cards with and without a bio line up. */}
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2 min-h-[2.5rem]">
              {props.bio || "No bio yet."}
            </p>

            {/* Every row is always rendered (with a placeholder when a value is
                missing) so details stay in the same spot on every card and nothing
                shifts when a coach is unrated or offers only one lesson type. */}
            <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-sm">
              <Stat icon={<span>♝</span>} muted={props.chessRating == null}>
                {props.chessRating != null ? `${props.chessRating} rated` : "Unrated"}
              </Stat>
              <Stat icon={<span className="text-amber-500">★</span>} muted={props.avgRating == null}>
                {props.avgRating != null ? `${props.avgRating.toFixed(1)} (${props.reviewCount})` : "No reviews"}
              </Stat>
              <Stat icon={<MessageSquare className="h-3.5 w-3.5" />} muted={props.coachChatPrice == null}>
                {props.coachChatPrice != null ? `$${(props.coachChatPrice / 100).toFixed(2)}/30 min chat` : "No chat lessons"}
              </Stat>
              <Stat icon={<Phone className="h-3.5 w-3.5" />} muted={props.coachCallPrice == null}>
                {props.coachCallPrice != null ? `$${(props.coachCallPrice / 100).toFixed(2)}/30 min call` : "No call lessons"}
              </Stat>
              <Stat icon={<BookOpen className="h-3.5 w-3.5" />}>
                {props.lessonsGiven} {props.lessonsGiven === 1 ? "lesson" : "lessons"}
              </Stat>
              <Stat icon={<Clock className="h-3.5 w-3.5" />}>
                <span className={`w-2 h-2 rounded-full ${getActivityDotColor(props.lastActiveAt)}`} />
                {formatRelativeTime(props.lastActiveAt)}
              </Stat>
            </div>

            {/* Fixed min-height so the languages strip reserves its space even when
                a coach hasn't listed any languages. */}
            <div className="mt-3 flex flex-wrap gap-1 min-h-[1.5rem]">
              {props.languages.length > 0 ? (
                <>
                  {props.languages.slice(0, 4).map((code) => (
                    <Badge key={code} variant="secondary" className="text-xs font-normal">
                      {getLanguageLabel(code)}
                    </Badge>
                  ))}
                  {props.languages.length > 4 && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      +{props.languages.length - 4}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No languages listed</span>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
