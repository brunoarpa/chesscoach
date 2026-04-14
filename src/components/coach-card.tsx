import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, Search, MessageSquare, Phone, BookOpen } from "lucide-react";

const continentLabels: Record<string, string> = {
  AFRICA: "Africa",
  ASIA: "Asia",
  EUROPE: "Europe",
  NORTH_AMERICA: "N. America",
  SOUTH_AMERICA: "S. America",
  OCEANIA: "Oceania",
};

const activityColors: Record<string, string> = {
  ACTIVE: "bg-green-500",
  AWAY: "bg-yellow-500",
  INACTIVE: "bg-gray-400",
};

interface Props {
  username: string;
  chessRating: number | null;
  continent: string | null;
  coachPricePerHour: number | null;
  gameReviewPrice: number | null;
  communicationPreference: string;
  coachElo: number;
  activityStatus: string;
  coachingEnabled: boolean;
  lastActiveAt: string;
  avgRating: number | null;
  reviewCount: number;
  lessonsGiven: number;
}

function formatLastSeen(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function CoachCard(props: Props) {
  return (
    <Link href={`/profile/${props.username}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{props.username}</h3>
              <div
                className={`w-2.5 h-2.5 rounded-full ${activityColors[props.activityStatus]}`}
                title={props.activityStatus}
              />
            </div>
            {props.coachElo > 0 && (
              <Badge variant="outline">ELO {Math.round(props.coachElo)}</Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground mb-3">
            {props.coachingEnabled ? "♟ Chess Coach" : "♟ Not Coaching"}
            <span className="ml-2 text-xs">· {formatLastSeen(props.lastActiveAt)}</span>
          </p>

          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {props.chessRating && (
              <span className="flex items-center gap-1">♟ {props.chessRating} rated</span>
            )}
            {props.continent && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {continentLabels[props.continent]}</span>
            )}
            {props.coachPricePerHour !== null && (
              <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> ${(props.coachPricePerHour / 100).toFixed(2)}/hr</span>
            )}
            {props.gameReviewPrice !== null && (
              <span className="flex items-center gap-1"><Search className="h-3 w-3" /> ${(props.gameReviewPrice / 100).toFixed(2)}/review</span>
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
          </div>

          {props.avgRating !== null && (
            <div className="mt-2 text-xs">
              {props.avgRating.toFixed(1)} ★ ({props.reviewCount} reviews)
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
