import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Phone, BookOpen, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { FavouriteButton } from "@/components/favourite-button";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { MessageUserButton } from "@/components/messages/message-user-button";
import { UserAvatar } from "@/components/user-avatar";
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
  image?: string | null;
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
  isLoggedIn?: boolean;
}

export function CoachCard(props: Props) {
  const profileHref = `/profile/${props.username}`;
  return (
    <div className="relative h-full">
      {props.showFavourite && (
        <div className="absolute top-2 right-2 z-10">
          <FavouriteButton coachId={props.id} initialFavourited={props.isFavourited ?? false} />
        </div>
      )}
      <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
        <CardContent className="pt-4 flex flex-1 flex-col">
          {/* Header + details link to the profile. Buttons live outside the link
              below so they stay independently clickable. */}
          <Link href={profileHref} className="block group">
            <div className="flex items-start gap-3 pr-8">
              <UserAvatar username={props.username} image={props.image} size="xl" />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold truncate group-hover:underline">
                  {props.username}
                </h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  ♝ Chess Coach
                  <BookingStatusBadge bookable={props.bookable} hasOpenSlots={props.hasOpenSlots} acceptingFreeTrials={props.acceptingFreeTrials} />
                </p>
                <p className="text-sm mt-0.5 flex items-center gap-3">
                  <span className={props.chessRating == null ? "text-muted-foreground/70" : "font-medium"}>
                    ♝ {props.chessRating != null ? `${props.chessRating}` : "Unrated"}
                  </span>
                  <span className={props.avgRating == null ? "text-muted-foreground/70" : ""}>
                    <span className="text-amber-500">★</span>{" "}
                    {props.avgRating != null ? `${props.avgRating.toFixed(1)} (${props.reviewCount})` : "No reviews"}
                  </span>
                </p>
              </div>
            </div>

            {/* Fixed two-line height so cards with and without a bio line up. */}
            <p className="text-sm text-muted-foreground mt-3 line-clamp-2 min-h-[2.5rem]">
              {props.bio || "No bio yet."}
            </p>

            {/* Every row is always rendered (with a placeholder when a value is
                missing) so details stay in the same spot on every card. */}
            <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-sm mt-1">
              <Stat icon={<MessageSquare className="h-3.5 w-3.5" />} muted={props.coachChatPrice == null}>
                {props.coachChatPrice != null ? `$${(props.coachChatPrice / 100).toFixed(2)} / 30 min chat` : "No chat lessons"}
              </Stat>
              <Stat icon={<Phone className="h-3.5 w-3.5" />} muted={props.coachCallPrice == null}>
                {props.coachCallPrice != null ? `$${(props.coachCallPrice / 100).toFixed(2)} / 30 min call` : "No call lessons"}
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
          </Link>

          {/* Actions: primary nudges toward the profile (where booking lives),
              secondary opens a low-commitment message. */}
          <div className="mt-4 flex gap-2">
            <Link href={profileHref} className="flex-1">
              <Button className="w-full">{props.bookable ? "Book a lesson" : "View profile"}</Button>
            </Link>
            {props.isLoggedIn ? (
              <MessageUserButton userId={props.id} label="Message" />
            ) : (
              <Link href={`/login?callbackUrl=${encodeURIComponent(profileHref)}`}>
                <Button variant="outline" className="gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Message
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
