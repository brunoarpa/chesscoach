import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, MessageSquare, Phone, BookOpen, Clock } from "lucide-react";
import { FavouriteButton } from "@/components/favourite-button";
import { getLanguageLabel } from "@/lib/languages";

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
  coachChatPrice: number | null;
  coachCallPrice: number | null;
  communicationPreference: string;
  coachElo: number;
  activityStatus: string;
  coachAvailability: string;
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
                ♝ Chess Coach
                {getEffectiveAvailability(props.coachAvailability, props.lastActiveAt, props.coachChatPrice, props.coachCallPrice) === "AVAILABLE" ? (
                  <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400">Available</Badge>
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
                <span className="flex items-center gap-1">♝ {props.chessRating} rated</span>
              )}
              {props.continent && (
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {continentLabels[props.continent]}</span>
              )}
              {props.coachChatPrice !== null && (
                <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> €{(props.coachChatPrice / 100).toFixed(2)}/slot (chat)</span>
              )}
              {props.coachCallPrice !== null && (
                <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> €{(props.coachCallPrice / 100).toFixed(2)}/slot (call)</span>
              )}
              <span className="flex items-center gap-1">
                {props.communicationPreference === "CHAT_AND_CALL" ? (
                  <><MessageSquare className="h-3 w-3" /><Phone className="h-3 w-3" /></>
                ) : (
                  <MessageSquare className="h-3 w-3" />
                )}{" "}
                {props.communicationPreference === "CHAT_AND_CALL" ? "Chat or Call" : "Chat"}
              </span>
              <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {props.lessonsGiven} lessons</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span className={`w-2 h-2 rounded-full ${getActivityDotColor(props.lastActiveAt)}`} />
                {formatRelativeTime(props.lastActiveAt)}
              </span>
            </div>

            {props.languages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
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
              </div>
            )}

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
