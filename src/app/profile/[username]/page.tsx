import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ReviewList } from "@/components/review-list";
import { SlotPicker } from "@/components/slot-picker";
import { ChessComVerificationForm } from "@/components/chess-com-verification-form";
import { fetchChessComRating } from "@/lib/chess-com";
import { getAvailableSlots } from "@/lib/actions/timeslots";
import { carriedOutTrialWhere } from "@/lib/lesson-ledger";
import { FavouriteButton } from "@/components/favourite-button";
import { getLanguageLabel } from "@/lib/languages";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const continentLabels: Record<string, string> = {
  AFRICA: "Africa",
  ASIA: "Asia",
  EUROPE: "Europe",
  NORTH_AMERICA: "North America",
  SOUTH_AMERICA: "South America",
  OCEANIA: "Oceania",
};

import { getActivityDotColor, getActivityLabel, getEffectiveAvailability, getRankStyle } from "@/lib/utils";

function formatLastSeen(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatAccountAge(date: Date): string {
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  let months = now.getMonth() - date.getMonth();
  let days = now.getDate() - date.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  if (days > 0 && years === 0) parts.push(`${days}d`);
  return parts.length > 0 ? parts.join(" ") : "< 1 day";
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  // Explicit select: this is a public page, so never pull fields like email,
  // passwordHash, or Stripe ids into the render path in the first place.
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      bio: true,
      continent: true,
      languages: true,
      coachChatPrice: true,
      coachCallPrice: true,
      communicationPreference: true,
      coachAvailability: true,
      coachElo: true,
      chessRating: true,
      chessComUsername: true,
      chessComAccountAge: true,
      verificationStatus: true,
      isSuspended: true,
      paidBookingsApproved: true,
      lessonsGiven: true,
      lessonsTaken: true,
      playersTaught: true,
      lastActiveAt: true,
      createdAt: true,
      reviewsReceived: {
        include: {
          fromUser: { select: { username: true } },
          lesson: { select: { studentId: true, coachId: true, estimatedCost: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!user) notFound();

  // Refresh chess.com rapid rating on profile view for verified users (still optional)
  if (user.verificationStatus === "VERIFIED" && user.chessComUsername) {
    const freshRating = await fetchChessComRating(user.chessComUsername);
    if (freshRating !== null && freshRating !== user.chessRating) {
      await prisma.user.update({
        where: { id: user.id },
        data: { chessRating: freshRating },
      });
      user.chessRating = freshRating;
    }
  }

  const session = await auth();
  const isOwnProfile = session?.user?.id === user.id;

  // Separate reviews: as coach (from students) vs as student (from coaches)
  const coachReviews = user.reviewsReceived.filter(
    (r) => r.lesson.coachId === user.id
  );
  const studentReviews = user.reviewsReceived.filter(
    (r) => r.lesson.studentId === user.id
  );

  const avgCoachRating =
    coachReviews.length > 0
      ? coachReviews.reduce((sum, r) => sum + r.rating, 0) / coachReviews.length
      : null;

  const avgStudentRating =
    studentReviews.length > 0
      ? studentReviews.reduce((sum, r) => sum + r.rating, 0) / studentReviews.length
      : null;

  // Fetch student wallet balance and free trials for lesson request form
  let studentAvailableBalance: number | null = null;
  let freeTrialsRemaining: number = 0;
  if (session?.user?.id && !isOwnProfile) {
    const studentData = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { walletBalance: true, reservedBalance: true, freeTrialsRemaining: true },
    });
    if (studentData) {
      studentAvailableBalance = studentData.walletBalance - studentData.reservedBalance;
      freeTrialsRemaining = studentData.freeTrialsRemaining;
    }
  }

  const websiteAge = Math.round(
    // eslint-disable-next-line react-hooks/purity -- Server Component: rendered once per request.
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check favourite and block status
  let isFavourited = false;
  let isBlocked = false;
  if (session?.user?.id && !isOwnProfile) {
    const [fav, block] = await Promise.all([
      prisma.favourite.findUnique({
        where: { userId_coachId: { userId: session.user.id, coachId: user.id } },
      }),
      prisma.block.findUnique({
        where: { coachId_studentId: { coachId: user.id, studentId: session.user.id } },
      }),
    ]);
    isFavourited = !!fav;
    isBlocked = !!block;
  }

  // Check coach lesson history: paid bookings unlock only after a completed trial.
  let hasCompletedTrial = true;      // default to true so non-coaches aren't gated
  const effectiveAvailability = getEffectiveAvailability(user.coachAvailability, user.coachChatPrice, user.coachCallPrice);
  const isCoachProfile = !!(user.coachChatPrice || user.coachCallPrice);

  // Global leaderboard rank (count of qualifying coaches with a higher ELO + 1).
  let coachRank: number | null = null;
  if (isCoachProfile && !user.isSuspended) {
    const higher = await prisma.user.count({
      where: {
        isSuspended: false,
        OR: [
          { coachChatPrice: { not: null } },
          { coachCallPrice: { not: null } },
        ],
        coachElo: { gt: user.coachElo },
      },
    });
    coachRank = higher + 1;
  }

  if (isCoachProfile && effectiveAvailability === "AVAILABLE") {
    // Mirrors the paid-booking gate in createLessonRequest.
    const trialCompleted = user.paidBookingsApproved
      ? { id: "admin-approved" }
      : await prisma.lessonRequest.findFirst({
          where: { coachId: user.id, ...carriedOutTrialWhere },
          select: { id: true },
        });
    hasCompletedTrial = !!trialCompleted;
  }

  const chessComAgeStr = user.chessComAccountAge
    ? formatAccountAge(user.chessComAccountAge)
    : null;

  // Fetch available slots for the coach
  let availableSlots: Array<{ id: string; startTime: string; endTime: string }> = [];
  if (!isOwnProfile && isCoachProfile && effectiveAvailability === "AVAILABLE") {
    const rawSlots = await getAvailableSlots(user.id);
    availableSlots = rawSlots.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
    }));
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{user.username}</h1>
            <div
              className={`w-3 h-3 rounded-full ${getActivityDotColor(user.lastActiveAt)}`}
              title={getActivityLabel(user.lastActiveAt)}
            />
            {user.verificationStatus === "VERIFIED" && (
              <Badge variant="default" title="chess.com account verified">✓ chess.com</Badge>
            )}
            {user.verificationStatus === "PENDING" && (
              <Badge variant="secondary">Pending Verification</Badge>
            )}
            {coachRank != null && (() => {
              const { className, medal } = getRankStyle(coachRank);
              return (
                <Link
                  href="/leaderboard"
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-bold tabular-nums ${className}`}
                  title={`Ranked #${coachRank} on the coach leaderboard`}
                >
                  {medal && <span aria-hidden>{medal}</span>}#{coachRank}
                </Link>
              );
            })()}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {getActivityLabel(user.lastActiveAt)}
          </p>
        </div>

        {isOwnProfile && (
          <Link href="/profile/edit" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto">Edit Profile</Button>
          </Link>
        )}
        {!isOwnProfile && session?.user && (
          <FavouriteButton coachId={user.id} initialFavourited={isFavourited} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="md:col-span-2 space-y-6">
          {user.bio && (
            <Card>
              <CardHeader>
                <CardTitle>Bio</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line">{user.bio}</p>
              </CardContent>
            </Card>
          )}

          {isCoachProfile && (
            <Card>
              <CardHeader>
                <CardTitle>Coach Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {user.chessRating && (
                    <div>
                      <span className="text-muted-foreground">Chess Rating:</span>{" "}
                      <strong>{user.chessRating}</strong>
                    </div>
                  )}
                  {user.continent && (
                    <div>
                      <span className="text-muted-foreground">Continent:</span>{" "}
                      <strong>{continentLabels[user.continent]}</strong>
                    </div>
                  )}
                  {user.coachChatPrice !== null && (
                    <div>
                      <span className="text-muted-foreground">Chat Price/slot:</span>{" "}
                      <strong>${(user.coachChatPrice / 100).toFixed(2)}</strong>
                    </div>
                  )}
                  {user.coachCallPrice !== null && (
                    <div>
                      <span className="text-muted-foreground">Call Price/slot:</span>{" "}
                      <strong>${(user.coachCallPrice / 100).toFixed(2)}</strong>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Communication:</span>{" "}
                    <strong>
                      {user.communicationPreference === "CHAT_AND_CALL"
                        ? "Chat or Call"
                        : "Chat Only"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Coach ELO:</span>{" "}
                    <strong>{Math.round(user.coachElo)}</strong>
                  </div>
                </div>
                {user.languages.length > 0 && (
                  <div className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">Languages:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {user.languages.map((code) => (
                        <Badge key={code} variant="secondary" className="font-normal">
                          {getLanguageLabel(code)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{user.lessonsGiven}</div>
                  <div className="text-sm text-muted-foreground">Lessons Given</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{user.playersTaught}</div>
                  <div className="text-sm text-muted-foreground">Students Taught</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{user.lessonsTaken}</div>
                  <div className="text-sm text-muted-foreground">Lessons Taken</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div>
            <Tabs defaultValue="coach-reviews">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Reviews</h2>
                <TabsList>
                  <TabsTrigger value="coach-reviews">
                    As Coach {avgCoachRating !== null && `(${avgCoachRating.toFixed(1)} ★)`}
                  </TabsTrigger>
                  <TabsTrigger value="student-reviews">
                    As Student {avgStudentRating !== null && `(${avgStudentRating.toFixed(1)} ★)`}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="coach-reviews">
                <ReviewList reviews={coachReviews} />
              </TabsContent>
              <TabsContent value="student-reviews">
                <ReviewList reviews={studentReviews} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Website Age:</span>{" "}
                {websiteAge} days
              </div>
              {chessComAgeStr !== null && (
                <div>
                  <span className="text-muted-foreground">Chess.com Age:</span>{" "}
                  {chessComAgeStr}
                </div>
              )}
              {avgCoachRating !== null && (
                <div>
                  <span className="text-muted-foreground">Coach Rating:</span>{" "}
                  {avgCoachRating.toFixed(1)} ★ ({coachReviews.length} reviews)
                </div>
              )}
              {avgStudentRating !== null && (
                <div>
                  <span className="text-muted-foreground">Student Rating:</span>{" "}
                  {avgStudentRating.toFixed(1)} ★ ({studentReviews.length} reviews)
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Last Seen:</span>{" "}
                {formatLastSeen(user.lastActiveAt)}
              </div>
            </CardContent>
          </Card>

          {/* Chess.com verification form for own profile */}
          {isOwnProfile && (user.verificationStatus === "NONE" || user.verificationStatus === "REJECTED") && (
            <ChessComVerificationForm />
          )}

          {/* Sign-in prompt for logged-out visitors looking at a bookable coach */}
          {!isOwnProfile &&
            !session?.user &&
            isCoachProfile &&
            effectiveAvailability === "AVAILABLE" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Book a Lesson</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Sign in to book a lesson with {user.username}.
                  </p>
                  <Link href={`/login?callbackUrl=/profile/${user.username}`}>
                    <Button className="w-full">Sign in to book</Button>
                  </Link>
                </CardContent>
              </Card>
            )}

          {/* Lesson booking for other profiles - always slot-based. SlotPicker
              renders its own "no slots available" empty state. */}
          {!isOwnProfile &&
            session?.user &&
            isCoachProfile &&
            effectiveAvailability === "AVAILABLE" &&
            !isBlocked && (
              <SlotPicker
                coachId={user.id}
                coachChatPrice={user.coachChatPrice}
                coachCallPrice={user.coachCallPrice}
                coachCommunicationPreference={user.communicationPreference}
                availableBalance={studentAvailableBalance ?? 0}
                freeTrialsRemaining={freeTrialsRemaining}
                slots={availableSlots}
                hasCompletedTrial={hasCompletedTrial}
              />
            )}
          {!isOwnProfile && isBlocked && session?.user && (
            <Card>
              <CardContent className="pt-6 text-center text-sm text-destructive">
                This coach has blocked you from requesting lessons.
              </CardContent>
            </Card>
          )}
          {!isOwnProfile &&
            isCoachProfile &&
            effectiveAvailability === "UNAVAILABLE" && (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  This coach is not currently taking students.
                </CardContent>
              </Card>
            )}
        </div>
      </div>
    </div>
  );
}
