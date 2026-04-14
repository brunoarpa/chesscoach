import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ReviewList } from "@/components/review-list";
import { LessonRequestForm } from "@/components/lesson-request-form";
import { ChessComVerificationForm } from "@/components/chess-com-verification-form";
import { fetchChessComRating } from "@/lib/chess-com";
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

const activityColors: Record<string, string> = {
  ACTIVE: "bg-green-500",
  AWAY: "bg-yellow-500",
  INACTIVE: "bg-gray-400",
};

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
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
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

  // Refresh chess.com rapid rating on profile view for verified users
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

  // Calculate total paid by each student reviewing (for coach reviews)
  const studentTotals: Record<string, number> = {};
  if (coachReviews.length > 0) {
    const completedLessons = await prisma.lessonRequest.findMany({
      where: {
        coachId: user.id,
        status: "COMPLETED",
      },
      select: { studentId: true, estimatedCost: true },
    });
    for (const lesson of completedLessons) {
      studentTotals[lesson.studentId] = (studentTotals[lesson.studentId] || 0) + lesson.estimatedCost;
    }
  }

  // Fetch student wallet balance for lesson request form
  let studentAvailableBalance: number | null = null;
  if (session?.user?.id && !isOwnProfile) {
    const studentData = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { walletBalance: true, reservedBalance: true },
    });
    if (studentData) {
      studentAvailableBalance = studentData.walletBalance - studentData.reservedBalance;
    }
  }

  const websiteAge = Math.round(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const chessComAgeStr = user.chessComAccountAge
    ? formatAccountAge(user.chessComAccountAge)
    : null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{user.username}</h1>
            <div
              className={`w-3 h-3 rounded-full ${activityColors[user.activityStatus]}`}
              title={user.activityStatus}
            />
            {user.verificationStatus === "VERIFIED" && (
              <Badge variant="default">Verified</Badge>
            )}
            {user.verificationStatus === "PENDING" && (
              <Badge variant="secondary">Pending Verification</Badge>
            )}
            {user.verificationStatus === "VERIFIED" && !user.coachingEnabled && (
              <Badge variant="outline">Not Coaching</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {user.activityStatus === "ACTIVE" ? "Active" : user.activityStatus === "AWAY" ? "Away" : "Inactive"}
          </p>
        </div>

        {isOwnProfile && (
          <Link href="/profile/edit">
            <Button variant="outline">Edit Profile</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="md:col-span-2 space-y-6">
          {user.bio && (
            <Card>
              <CardContent className="pt-6">
                <p>{user.bio}</p>
              </CardContent>
            </Card>
          )}

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
                {user.coachPricePerHour !== null && (
                  <div>
                    <span className="text-muted-foreground">Price/Hour:</span>{" "}
                    <strong>${(user.coachPricePerHour / 100).toFixed(2)}</strong>
                  </div>
                )}
                {user.gameReviewPrice !== null && (
                  <div>
                    <span className="text-muted-foreground">Game Review:</span>{" "}
                    <strong>${(user.gameReviewPrice / 100).toFixed(2)}</strong>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Communication:</span>{" "}
                  <strong>
                    {user.communicationPreference === "CHAT_AND_CALL"
                      ? "Chat & Call"
                      : "Chat Only"}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Coach ELO:</span>{" "}
                  <strong>{Math.round(user.coachElo)}</strong>
                </div>
              </div>
            </CardContent>
          </Card>

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
                <ReviewList
                  reviews={coachReviews.map((r) => ({
                    ...r,
                    totalPaid: studentTotals[r.fromUserId] || 0,
                  }))}
                  showTotalPaid
                />
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
            <CardContent className="pt-6 space-y-2 text-sm">
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
                <span className="text-muted-foreground">Status:</span>{" "}
                {user.activityStatus}
              </div>

              {user.verificationStatus === "VERIFIED" && (
                <div>
                  <span className="text-muted-foreground">Coaching:</span>{" "}
                  {user.coachingEnabled ? "Available" : "Not taking students"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chess.com verification form for own profile */}
          {isOwnProfile && (user.verificationStatus === "NONE" || user.verificationStatus === "REJECTED") && (
            <ChessComVerificationForm />
          )}

          {/* Lesson request for other profiles */}
          {!isOwnProfile &&
            session?.user &&
            user.verificationStatus === "VERIFIED" &&
            user.coachingEnabled && (
              <LessonRequestForm
                coachId={user.id}
                coachPricePerHour={user.coachPricePerHour}
                gameReviewPrice={user.gameReviewPrice}
                availableBalance={studentAvailableBalance ?? 0}
              />
            )}
          {!isOwnProfile &&
            user.verificationStatus === "VERIFIED" &&
            !user.coachingEnabled && (
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
