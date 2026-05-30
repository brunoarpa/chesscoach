import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCoachElo } from "@/lib/elo";
import { CoachDashboard, PendingRequestCard } from "@/components/dashboard/coach-dashboard";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { CoachScheduleEditor } from "@/components/coach-schedule-editor";
import { CoachInviteBanner } from "@/components/dashboard/coach-invite-banner";
import { expirePendingRequests, autoCompleteLessons } from "@/lib/activity";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Redirect Google users (and anyone without a username) to set up their profile first.
  if (session.user.needsUsername) redirect("/setup-username");

  // Run inline so deadlines & auto-completions are accurate, not just at 6am cron.
  expirePendingRequests().catch(() => {});
  autoCompleteLessons().catch(() => {});

  // Check if coach needs to be forced UNAVAILABLE (inactive 24h+ or no price)
  const userCheck = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { lastActiveAt: true, coachAvailability: true, coachChatPrice: true, coachCallPrice: true },
  });

  const wasInactive = userCheck
    ? (Date.now() - userCheck.lastActiveAt.getTime()) >= 24 * 60 * 60 * 1000
    : false;
  const shouldForceUnavailable = userCheck
    ? (wasInactive || (userCheck.coachChatPrice === null && userCheck.coachCallPrice === null)) && userCheck.coachAvailability !== "UNAVAILABLE"
    : false;

  // Update activity and fetch user data
  const currentUser = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      lastActiveAt: new Date(),
      activityStatus: "ACTIVE",
      ...(shouldForceUnavailable ? { coachAvailability: "UNAVAILABLE" } : {}),
    },
    select: { isSuspended: true, freeTrialsRemaining: true, coachAvailability: true, hasActiveDispute: true, verificationStatus: true, coachChatPrice: true, coachCallPrice: true },
  });

  const isCoach = !!(currentUser.coachChatPrice || currentUser.coachCallPrice);

  // Recalculate coach ELO on every dashboard visit for anyone set up as a coach.
  if (isCoach) {
    const newElo = await calculateCoachElo(session.user.id);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { coachElo: newElo },
    });
  }

  const ACTIVE_STATUSES = ["PENDING", "ACCEPTED", "IN_PROGRESS", "DISPUTED"] as const;
  const OTHER_STATUSES = new Set(["DECLINED", "CANCELLED", "EXPIRED", "NO_SHOW"]);

  const [
    incomingActive,
    incomingCompletedRecent,
    incomingStatusCounts,
    incomingHasCompletedTrial,
    outgoingActive,
    outgoingCompletedRecent,
    outgoingStatusCounts,
    favouriteCoaches,
    weeklyTemplates,
  ] = await Promise.all([
    // Coach incoming — active (rendered as cards)
    prisma.lessonRequest.findMany({
      where: { coachId: session.user.id, status: { in: [...ACTIVE_STATUSES] } },
      include: {
        student: { select: { username: true, chessComUsername: true } },
        reviews: {
          where: { fromUserId: session.user.id },
          select: { id: true, rating: true, comment: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Coach incoming — most recent completed (max 3 shown)
    prisma.lessonRequest.findMany({
      where: { coachId: session.user.id, status: "COMPLETED" },
      include: {
        student: { select: { username: true, chessComUsername: true } },
        reviews: {
          where: { fromUserId: session.user.id },
          select: { id: true, rating: true, comment: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    // Coach incoming — counts by status (for "View all (N)" links)
    prisma.lessonRequest.groupBy({
      by: ["status"],
      where: { coachId: session.user.id },
      _count: { _all: true },
    }),
    // Has any completed trial? (unlocks paid bookings)
    prisma.lessonRequest.findFirst({
      where: { coachId: session.user.id, status: "COMPLETED", isTrial: true },
      select: { id: true },
    }),
    // Student outgoing — active
    prisma.lessonRequest.findMany({
      where: { studentId: session.user.id, status: { in: [...ACTIVE_STATUSES] } },
      include: {
        coach: { select: { username: true, chessComUsername: true } },
        reviews: {
          where: { fromUserId: session.user.id },
          select: { id: true, rating: true, comment: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Student outgoing — most recent completed (max 3)
    prisma.lessonRequest.findMany({
      where: { studentId: session.user.id, status: "COMPLETED" },
      include: {
        coach: { select: { username: true, chessComUsername: true } },
        reviews: {
          where: { fromUserId: session.user.id },
          select: { id: true, rating: true, comment: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    // Student outgoing — counts by status
    prisma.lessonRequest.groupBy({
      by: ["status"],
      where: { studentId: session.user.id },
      _count: { _all: true },
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
            coachChatPrice: true,
            coachCallPrice: true,
            lastActiveAt: true,
          },
        },
      },
    }),
    // Weekly schedule templates (for coaches)
    prisma.timeSlotTemplate.findMany({
      where: { coachId: session.user.id },
      select: { dayOfWeek: true, startHour: true, startMinute: true },
      orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }, { startMinute: "asc" }],
    }),
  ]);

  type StatusCount = { status: string; _count: { _all: number } };
  const sumOther = (counts: StatusCount[]) =>
    counts
      .filter((s) => OTHER_STATUSES.has(s.status))
      .reduce((sum, s) => sum + s._count._all, 0);
  const completedOf = (counts: StatusCount[]) =>
    counts.find((s) => s.status === "COMPLETED")?._count._all ?? 0;

  const incomingCompletedTotal = completedOf(incomingStatusCounts);
  const incomingOtherTotal = sumOther(incomingStatusCounts);
  const outgoingCompletedTotal = completedOf(outgoingStatusCounts);
  const outgoingOtherTotal = sumOther(outgoingStatusCounts);

  const incomingRequests = [...incomingActive, ...incomingCompletedRecent];
  const outgoingRequests = [...outgoingActive, ...outgoingCompletedRecent];

  // Pending lesson requests from students need the user's response — hoist to top.
  const pendingIncoming = incomingActive.filter((r) => r.status === "PENDING");

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <AutoRefresh />
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {currentUser.isSuspended && (
        <div className="mb-6 p-4 rounded-lg border border-destructive bg-destructive/10 text-destructive">
          <p className="font-medium">Your account is suspended.</p>
          <p className="text-sm mt-1">
            You cannot book lessons, accept lessons, or deposit funds. You can still withdraw any remaining coach earnings.
            Contact support at{" "}
            <a href="mailto:chesscoach.training@gmail.com" className="underline font-medium">
              chesscoach.training@gmail.com
            </a>{" "}
            to appeal.
          </p>
        </div>
      )}

      {!currentUser.isSuspended && !isCoach && (
        <CoachInviteBanner />
      )}

      {pendingIncoming.length > 0 && (
        <section className="mb-8">
          <div className="rounded-lg border border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-200">
                Needs your response
              </h2>
              <span className="text-sm text-amber-800 dark:text-amber-300">
                {pendingIncoming.length} lesson {pendingIncoming.length === 1 ? "request" : "requests"} from {pendingIncoming.length === 1 ? "a student" : "students"}
              </span>
            </div>
            <div className="space-y-3">
              {pendingIncoming.map((r) => (
                <PendingRequestCard key={r.id} request={JSON.parse(JSON.stringify(r))} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-1">
          Lessons you&apos;re taking
          {outgoingActive.length > 0 && (
            <span className="ml-2 text-base text-muted-foreground">
              ({outgoingActive.length} active)
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Lessons you&apos;ve booked with coaches.
        </p>
        <StudentDashboard
          requests={JSON.parse(JSON.stringify(outgoingRequests))}
          freeTrialsRemaining={currentUser.freeTrialsRemaining}
          hasActiveDispute={currentUser.hasActiveDispute}
          favouriteCoaches={JSON.parse(JSON.stringify(favouriteCoaches.map((f) => f.coach)))}
          completedTotal={outgoingCompletedTotal}
          otherTotal={outgoingOtherTotal}
        />
      </section>

      <hr className="my-8 border-border" />

      <section>
        <h2 className="text-xl font-semibold mb-1">
          Lessons you&apos;re teaching
          {incomingActive.length > 0 && (
            <span className="ml-2 text-base text-muted-foreground">
              ({incomingActive.length} active)
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {isCoach
            ? "Lessons students have booked with you."
            : "You haven't set up a coach profile yet."}
        </p>
        <CoachDashboard
          requests={JSON.parse(JSON.stringify(incomingRequests))}
          coachAvailability={currentUser.coachAvailability}
          isCoach={isCoach}
          completedTotal={incomingCompletedTotal}
          otherTotal={incomingOtherTotal}
          hasCompletedTrial={!!incomingHasCompletedTrial}
          hidePending
        />
        {isCoach && (
          <div className="mt-6">
            <CoachScheduleEditor initialTemplates={weeklyTemplates} />
          </div>
        )}
      </section>
    </div>
  );
}
