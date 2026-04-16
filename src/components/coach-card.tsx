import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, MessageSquare, Phone, BookOpen, Clock } from "lucide-react";
import { FavouriteButton } from "@/components/favourite-button";

const continentLabels: Record<string, string> = {
  AFRICA: "Africa",
  ASIA: "Asia",
  EUROPE: "Europe",
  NORTH_AMERICA: "N. America",
  SOUTH_AMERICA: "S. America",
  OCEANIA: "Oceania",
};

import { getActivityDotColor, getEffectiveAvailability } from "@/lib/utils";

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

interface Props {
  id: string;
  username: string;
  chessRating: number | null;
  continent: string | null;
  coachPricePer5Min: number | null;
  communicationPreference: string;
  coachElo: number;
  activityStatus: string;
  coachAvailability: string;
  lastActiveAt: Date;
  avgRating: number | null;
  reviewCount: number;
  lessonsGiven: number;
  bio: string | null;
  isFavourited?: boolean;
  showFavourite?: boolean;
}

export function CoachCard(props: Props) {
  return (
    <div className="relative">
      {props.showFavourite && (
        <div className="absolute top-2 right-2 z-10">
          <FavouriteButton coachId={props.id} initialFavourited={props.isFavourited ?? false} />
        </div>
      )}
      <Link href={`/profile/${props.username}`}>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{props.username}</h3>
              </div>
              {props.coachElo > 0 && (
                <Badge variant="outline" className={props.showFavourite ? "mr-6" : ""}>ELO {Math.round(props.coachElo)}</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground mb-3">
              <span className="flex items-center gap-1.5">
                ♟ Chess Coach
                {getEffectiveAvailability(props.coachAvailability, props.lastActiveAt) === "AVAILABLE" ? (
                  <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400">Available</Badge>
                ) : getEffectiveAvailability(props.coachAvailability, props.lastActiveAt) === "BUSY" ? (
                  <Badge variant="destructive">Busy</Badge>
                ) : (
                  <Badge variant="secondary">Unavailable</Badge>
                )}
              </span>
            </p>

            {props.bio && (
              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                {props.bio}
              </p>
            )}

            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {props.chessRating && (
                <span className="flex items-center gap-1">♟ {props.chessRating} rated</span>
              )}
              {props.continent && (
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {continentLabels[props.continent]}</span>
              )}
              {props.coachPricePer5Min !== null && (
                <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> €{(props.coachPricePer5Min / 100).toFixed(2)}/5min</span>
              )}
              <span className="flex items-center gap-1">
                {props.communicationPreference === "CHAT_AND_CALL" ? (
                  <><MessageSquare className="h-3 w-3" /><Phone className="h-3 w-3" /></>
                ) : (
                  <MessageSquare className="h-3 w-3" />
                )}{" "}
                {props.communicationPreference === "CHAT_AND_CALL" ? "Chat & Call" : "Chat"}
              </span>
              <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {props.lessonsGiven} lessons</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span className={`w-2 h-2 rounded-full ${getActivityDotColor(props.lastActiveAt)}`} />
                {formatRelativeTime(props.lastActiveAt)}
              </span>
            </div>

            {props.avgRating !== null && (
              <div className="mt-2 text-xs">
                {props.avgRating.toFixed(1)} ★ ({props.reviewCount} reviews)
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
