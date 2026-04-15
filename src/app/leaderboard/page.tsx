import { prisma } from "@/lib/prisma";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
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

export default async function LeaderboardPage() {
  const coaches = await prisma.user.findMany({
    where: {
      verificationStatus: "VERIFIED",
    },
    orderBy: { coachElo: "desc" },
    take: 100,
    select: {
      username: true,
      coachElo: true,
      chessRating: true,
      lessonsGiven: true,
      playersTaught: true,
      activityStatus: true,
      lastActiveAt: true,
      coachAvailability: true,
    },
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Coach Leaderboard</h1>
      <p className="text-muted-foreground mb-8">
        Rankings based on coach rating.
      </p>

      {coaches.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No coaches on the leaderboard yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Coach</TableHead>
              <TableHead className="text-right">Coach Rating</TableHead>
              <TableHead className="text-right">Chess Rating</TableHead>
              <TableHead className="text-right">Lessons</TableHead>
              <TableHead className="text-right">Students</TableHead>
              <TableHead className="text-center">Last Active</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coaches.map((coach, i) => (
              <TableRow key={coach.username}>
                <TableCell className="font-bold">{i + 1}</TableCell>
                <TableCell>
                  <Link
                    href={`/profile/${coach.username}`}
                    className="hover:underline font-medium"
                  >
                    {coach.username}
                  </Link>
                  <span className="text-xs text-muted-foreground ml-2">
                    ♟ {coach.chessRating ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {Math.round(coach.coachElo)}
                </TableCell>
                <TableCell className="text-right">
                  {coach.chessRating ?? "—"}
                </TableCell>
                <TableCell className="text-right">{coach.lessonsGiven}</TableCell>
                <TableCell className="text-right">{coach.playersTaught}</TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${getActivityDotColor(coach.lastActiveAt)}`} />
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(coach.lastActiveAt)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {coach.coachAvailability === "AVAILABLE" ? (
                    <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400">Available</Badge>
                  ) : coach.coachAvailability === "BUSY" ? (
                    <Badge variant="destructive">Busy</Badge>
                  ) : (
                    <Badge variant="secondary">Unavailable</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
