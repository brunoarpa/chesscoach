import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ReviewList } from "@/components/review-list";
import { LessonRequestForm } from "@/components/lesson-request-form";
import { ChessComVerificationForm } from "@/components/chess-com-verification-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
        include: { fromUser: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!user) notFound();

  const session = await auth();
  const isOwnProfile = session?.user?.id === user.id;

  // Calculate average rating
  const avgRating =
    user.reviewsReceived.length > 0
      ? user.reviewsReceived.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) /
        user.reviewsReceived.length
      : null;

  const websiteAge = Math.round(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const chessComAge = user.chessComAccountAge
    ? Math.round(
        (Date.now() - user.chessComAccountAge.getTime()) /
          (1000 * 60 * 60 * 24 * 365)
      )
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
          </div>
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
            <h2 className="text-xl font-semibold mb-4">
              Reviews {avgRating !== null && `(${avgRating.toFixed(1)} ★)`}
            </h2>
            <ReviewList reviews={user.reviewsReceived} />
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
              {chessComAge !== null && (
                <div>
                  <span className="text-muted-foreground">Chess.com Age:</span>{" "}
                  {chessComAge} years
                </div>
              )}
              {avgRating !== null && (
                <div>
                  <span className="text-muted-foreground">Rating:</span>{" "}
                  {avgRating.toFixed(1)} ★ ({user.reviewsReceived.length} reviews)
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                {user.activityStatus}
              </div>
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
            (user.coachPricePerHour || user.gameReviewPrice) && (
              <LessonRequestForm
                coachId={user.id}
                coachPricePerHour={user.coachPricePerHour}
                gameReviewPrice={user.gameReviewPrice}
              />
            )}
        </div>
      </div>
    </div>
  );
}
