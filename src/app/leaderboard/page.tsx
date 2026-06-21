import { prisma } from "@/lib/prisma";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getActivityDotColor, getEffectiveAvailability, getRankStyle } from "@/lib/utils";
import { BookingStatusBadge } from "@/components/booking-status-badge";

const PER_PAGE = 10;

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

function RankBadge({ rank }: { rank: number }) {
  const { className, medal } = getRankStyle(rank);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-bold tabular-nums ${className}`}>
      {medal && <span aria-hidden>{medal}</span>}#{rank}
    </span>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const where = {
    isSuspended: false,
    OR: [
      { coachChatPrice: { not: null } },
      { coachCallPrice: { not: null } },
    ],
  };

  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(1, Number(pageParam) || 1), totalPages);
  const skip = (page - 1) * PER_PAGE;

  const coaches = await prisma.user.findMany({
    where,
    orderBy: { coachElo: "desc" },
    skip,
    take: PER_PAGE,
    select: {
      username: true,
      coachElo: true,
      chessRating: true,
      lessonsGiven: true,
      playersTaught: true,
      activityStatus: true,
      lastActiveAt: true,
      coachAvailability: true,
      acceptingFreeTrials: true,
      coachChatPrice: true,
      coachCallPrice: true,
      verificationStatus: true,
      _count: {
        select: {
          timeSlots: { where: { status: "AVAILABLE", startTime: { gte: new Date() } } },
        },
      },
    },
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Coach Leaderboard</h1>
      <p className="text-muted-foreground mb-8">
        Rankings based on coach rating.
      </p>

      {total === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No coaches on the leaderboard yet.
        </p>
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="md:hidden space-y-3">
            {coaches.map((coach, i) => {
              const rank = skip + i + 1;
              const bookable = getEffectiveAvailability(coach.coachAvailability, coach.coachChatPrice, coach.coachCallPrice) === "AVAILABLE";
              return (
                <Card key={coach.username}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <RankBadge rank={rank} />
                        <Link href={`/profile/${coach.username}`} className="font-medium hover:underline">
                          {coach.username}
                        </Link>
                        {coach.verificationStatus === "VERIFIED" && (
                          <Badge variant="outline" title="Verified on chess.com" className="text-xs">✓ chess.com</Badge>
                        )}
                      </div>
                      <BookingStatusBadge bookable={bookable} hasOpenSlots={coach._count.timeSlots > 0} acceptingFreeTrials={coach.acceptingFreeTrials} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Coach Rating</span>
                      <span className="text-right font-mono font-medium">{Math.round(coach.coachElo)}</span>
                      <span className="text-muted-foreground">Chess Rating</span>
                      <span className="text-right">{coach.chessRating ?? "-"}</span>
                      <span className="text-muted-foreground">Lessons</span>
                      <span className="text-right">{coach.lessonsGiven}</span>
                      <span className="text-muted-foreground">Students</span>
                      <span className="text-right">{coach.playersTaught}</span>
                      <span className="text-muted-foreground">Chat lesson / slot</span>
                      <span className="text-right">{coach.coachChatPrice !== null ? `$${(coach.coachChatPrice / 100).toFixed(2)}` : "-"}</span>
                      {coach.coachCallPrice !== null && (
                        <><span className="text-muted-foreground">Call lesson / slot</span>
                        <span className="text-right">${(coach.coachCallPrice / 100).toFixed(2)}</span></>
                      )}
                      <span className="text-muted-foreground">Last Active</span>
                      <span className="text-right flex items-center justify-end gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${getActivityDotColor(coach.lastActiveAt)}`} />
                        {formatRelativeTime(coach.lastActiveAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop table layout */}
          <div className="hidden md:block">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Rank</TableHead>
              <TableHead>Coach</TableHead>
              <TableHead className="text-right">Coach Rating</TableHead>
              <TableHead className="text-right">Chess Rating</TableHead>
              <TableHead className="text-right">Lessons</TableHead>
              <TableHead className="text-right">Chat Lesson / slot</TableHead>
              <TableHead className="text-right">Call Lesson / slot</TableHead>
              <TableHead className="text-center">Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coaches.map((coach, i) => {
              const rank = skip + i + 1;
              const bookable = getEffectiveAvailability(coach.coachAvailability, coach.coachChatPrice, coach.coachCallPrice) === "AVAILABLE";
              return (
              <TableRow key={coach.username}>
                <TableCell>
                  <RankBadge rank={rank} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/profile/${coach.username}`}
                    className="hover:underline font-medium"
                  >
                    {coach.username}
                  </Link>
                  {coach.verificationStatus === "VERIFIED" && (
                    <span className="ml-2 text-xs text-green-600 dark:text-green-400" title="Verified on chess.com">✓</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-2">
                    ♝ {coach.chessRating ?? "-"}
                  </span>
                  <BookingStatusBadge bookable={bookable} hasOpenSlots={coach._count.timeSlots > 0} acceptingFreeTrials={coach.acceptingFreeTrials} className="ml-2" />
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {Math.round(coach.coachElo)}
                </TableCell>
                <TableCell className="text-right">
                  {coach.chessRating ?? "-"}
                </TableCell>
                <TableCell className="text-right">{coach.lessonsGiven}</TableCell>
                <TableCell className="text-right">
                  {coach.coachChatPrice !== null ? `$${(coach.coachChatPrice / 100).toFixed(2)}` : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {coach.coachCallPrice !== null ? `$${(coach.coachCallPrice / 100).toFixed(2)}` : "-"}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${getActivityDotColor(coach.lastActiveAt)}`} />
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(coach.lastActiveAt)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              {page > 1 ? (
                <Link href={`/leaderboard?page=${page - 1}`}>
                  <Button variant="outline" size="sm">Previous</Button>
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>Previous</Button>
              )}
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={`/leaderboard?page=${page + 1}`}>
                  <Button variant="outline" size="sm">Next</Button>
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>Next</Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
