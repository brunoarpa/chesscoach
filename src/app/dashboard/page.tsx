import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCoachElo } from "@/lib/elo";
import { CoachDashboard } from "@/components/dashboard/coach-dashboard";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Check if coach needs to be forced UNAVAILABLE (inactive 24h+ or no price)
  const userCheck = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { lastActiveAt: true, coachAvailability: true, coachPricePer5Min: true },
  });

  const wasInactive = userCheck
    ? (Date.now() - userCheck.lastActiveAt.getTime()) >= 24 * 60 * 60 * 1000
    : false;
  const shouldForceUnavailable = userCheck
    ? (wasInactive || userCheck.coachPricePer5Min === null) && userCheck.coachAvailability !== "UNAVAILABLE"
    : false;

  // Update activity and fetch user data
  const currentUser = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      lastActiveAt: new Date(),
      activityStatus: "ACTIVE",
      ...(shouldForceUnavailable ? { coachAvailability: "UNAVAILABLE" } : {}),
    },
    select: { isSuspended: true, freeTrialsRemaining: true, coachAvailability: true, hasActiveDispute: true, verificationStatus: true },
  });

  // Recalculate coach ELO on every dashboard visit for verified coaches
  if (currentUser.verificationStatus === "VERIFIED") {
    const newElo = await calculateCoachElo(session.user.id);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { coachElo: newElo },
    });
  }

  const [incomingRequests, outgoingRequests, favouriteCoaches] = await Promise.all([
    // Coach incoming
    prisma.lessonRequest.findMany({
      where: { coachId: session.user.id },
      include: {
        student: { select: { username: true, chessComUsername: true } },
        reviews: {
          where: { fromUserId: session.user.id },
          select: { id: true, rating: true, comment: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Student outgoing
    prisma.lessonRequest.findMany({
      where: { studentId: session.user.id },
      include: {
        coach: { select: { username: true, chessComUsername: true } },
        reviews: {
          where: { fromUserId: session.user.id },
          select: { id: true, rating: true, comment: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Favourite coaches
    prisma.favourite.findMany({
      where: { userId: session.user.id },
      include: {
        coach: {
          select: {
            id: true,
            username: true,
            coachAvailability: true,
            chessRating: true,
            coachPricePer5Min: true,
            lastActiveAt: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <AutoRefresh />
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {currentUser.isSuspended && (
        <div className="mb-6 p-4 rounded-lg border border-destructive bg-destructive/10 text-destructive">
          <p className="font-medium">Your account is under review.</p>
          <p className="text-sm mt-1">
            You cannot create new lesson requests or make deposits while your account is being reviewed.
            Contact support at{" "}
            <a href="mailto:chesscoach.training@gmail.com" className="underline font-medium">
              chesscoach.training@gmail.com
            </a>
          </p>
        </div>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4">
          Coach
          {incomingRequests.filter((r: { status: string }) => r.status === "PENDING" || r.status === "ACCEPTED" || r.status === "IN_PROGRESS" || r.status === "DISPUTED").length > 0 && (
            <span className="ml-2 text-base text-muted-foreground">
              ({incomingRequests.filter((r: { status: string }) => r.status === "PENDING" || r.status === "ACCEPTED" || r.status === "IN_PROGRESS" || r.status === "DISPUTED").length} active)
            </span>
          )}
        </h2>
        <CoachDashboard
          requests={JSON.parse(JSON.stringify(incomingRequests))}
          coachAvailability={currentUser.coachAvailability}
        />
      </section>

      <hr className="my-8 border-border" />

      <section>
        <h2 className="text-xl font-semibold mb-4">
          Student
          {outgoingRequests.filter((r: { status: string }) => r.status === "PENDING" || r.status === "ACCEPTED" || r.status === "IN_PROGRESS" || r.status === "DISPUTED").length > 0 && (
            <span className="ml-2 text-base text-muted-foreground">
              ({outgoingRequests.filter((r: { status: string }) => r.status === "PENDING" || r.status === "ACCEPTED" || r.status === "IN_PROGRESS" || r.status === "DISPUTED").length} active)
            </span>
          )}
        </h2>
        <StudentDashboard
          requests={JSON.parse(JSON.stringify(outgoingRequests))}
          freeTrialsRemaining={currentUser.freeTrialsRemaining}
          hasActiveDispute={currentUser.hasActiveDispute}
          favouriteCoaches={JSON.parse(JSON.stringify(favouriteCoaches.map((f) => f.coach)))}
        />
      </section>
    </div>
  );
}
