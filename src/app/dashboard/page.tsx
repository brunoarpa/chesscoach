import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCoachElo } from "@/lib/elo";
import { carriedOutTrialWhere } from "@/lib/lesson-ledger";
import { CoachDashboard, PendingRequestCard } from "@/components/dashboard/coach-dashboard";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { CoachScheduleEditor } from "@/components/coach-schedule-editor";
import { CoachInviteBanner } from "@/components/dashboard/coach-invite-banner";
import { expirePendingRequests, autoCompleteLessons, detectNoShows, DISPUTE_WINDOW_MS } from "@/lib/activity";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { setup } = await searchParams;

  // Redirect Google users (and anyone without a username) to set up their profile first.
  if (session.user.needsUsername) redirect("/setup-username");

  // Run inline so deadlines & auto-completions are accurate, not just at the
  // daily cron. Scoped to this user - the global sweep is the cron's job.
  // Awaited (allSettled) so they actually finish before the response: a
  // serverless function can freeze the moment it returns, so fire-and-forget
  // sweeps here would frequently be killed mid-flight and silently dropped.
  await Promise.allSettled([
    expirePendingRequests(session.user.id),
    autoCompleteLessons(session.user.id),
    detectNoShows(session.user.id),
  ]);

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuspended: true, freeTrialsRemaining: true, coachAvailability: true, hasActiveDispute: true, verificationStatus: true, coachChatPrice: true, coachCallPrice: true, timezone: true, lastActiveAt: true, paidBookingsApproved: true },
  });
  if (!currentUser) redirect("/login");

  const isCoach = !!(currentUser.coachChatPrice || currentUser.coachCallPrice);

  // Refresh activity + coach ELO at most once a minute - the dashboard
  // auto-refreshes, so unthrottled writes here multiply with user count.
  // eslint-disable-next-line react-hooks/purity -- Server Component: rendered once per request, so Date.now() is stable here.
  const activityStale = Date.now() - currentUser.lastActiveAt.getTime() > 60 * 1000;
  if (activityStale) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
    });
    if (isCoach) {
      // After the activity refresh, so the ELO activity bonus sees it.
      const newElo = await calculateCoachElo(session.user.id);
      await prisma.user.update({
        where: { id: session.user.id },
        data: { coachElo: newElo },
      });
    }
  }

  const ACTIVE_STATUSES = ["PENDING", "ACCEPTED", "IN_PROGRESS", "DISPUTED"] as const;
  const OTHER_STATUSES = new Set(["DECLINED", "CANCELLED", "EXPIRED", "NO_SHOW"]);

  const [
    incomingActive,
    incomingCompletedRecent,
    incomingStatusCounts,
    incomingHasCompletedTrial,
    incomingPendingTrial,
    outgoingActive,
    outgoingCompletedRecent,
    outgoingStatusCounts,
    weeklyTemplates,
  ] = await Promise.all([
    // Coach incoming - active
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
    // Coach incoming - most recent completed (for review prompt)
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
      take: 1,
    }),
    // Coach incoming - counts by status
    prisma.lessonRequest.groupBy({
      by: ["status"],
      where: { coachId: session.user.id },
      _count: { _all: true },
    }),
    // Mirrors the paid-booking gate in createLessonRequest.
    prisma.lessonRequest.findFirst({
      where: { coachId: session.user.id, ...carriedOutTrialWhere },
      select: { id: true },
    }),
    // A trial both parties carried out that is still inside its dispute
    // window - shown to the coach as "waiting for the student to confirm".
    prisma.lessonRequest.findFirst({
      where: {
        coachId: session.user.id,
        isTrial: true,
        status: "IN_PROGRESS",
        coachJoinedAt: { not: null },
        studentJoinedAt: { not: null },
      },
      select: { scheduledEndAt: true },
      orderBy: { scheduledStartAt: "desc" },
    }),
    // Student outgoing - active
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
    // Student outgoing - most recent completed (for review prompt)
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
      take: 1,
    }),
    prisma.lessonRequest.groupBy({
      by: ["status"],
      where: { studentId: session.user.id },
      _count: { _all: true },
    }),
    prisma.timeSlotTemplate.findMany({
      where: { coachId: session.user.id },
      select: { dayOfWeek: true, startHour: true, startMinute: true },
      orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }, { startMinute: "asc" }],
    }),
  ]);

  type StatusCount = { status: string; _count: { _all: number } };
  const sumOther = (counts: StatusCount[]) =>
    counts.filter((s) => OTHER_STATUSES.has(s.status)).reduce((sum, s) => sum + s._count._all, 0);
  const completedOf = (counts: StatusCount[]) =>
    counts.find((s) => s.status === "COMPLETED")?._count._all ?? 0;

  const incomingCompletedTotal = completedOf(incomingStatusCounts);
  const incomingOtherTotal = sumOther(incomingStatusCounts);
  const outgoingCompletedTotal = completedOf(outgoingStatusCounts);
  const outgoingOtherTotal = sumOther(outgoingStatusCounts);

  const incomingRequests = [...incomingActive, ...incomingCompletedRecent];
  const outgoingRequests = [...outgoingActive, ...outgoingCompletedRecent];

  const pendingIncoming = incomingActive.filter((r) => r.status === "PENDING");

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <AutoRefresh />
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      {currentUser.isSuspended && (
        <div className="mb-6 p-4 rounded-lg border border-destructive bg-destructive/10 text-destructive">
          <p className="font-medium">Your account is suspended.</p>
          <p className="text-sm mt-1">
            You cannot book lessons, accept lessons, deposit funds, or withdraw earnings while your account is under review.
            Use the{" "}
            <Link href="/contact" className="underline font-medium">
              contact form
            </Link>{" "}
            to appeal.
          </p>
        </div>
      )}

      {!currentUser.isSuspended && !isCoach && <CoachInviteBanner />}

      {/* Onboarding hand-off from profile setup: prices are saved, the last
          step is a weekly schedule so students have slots to book. */}
      {setup === "schedule" && isCoach && weeklyTemplates.length === 0 && (
        <div className="mb-6 p-4 rounded-lg border border-primary/40 bg-primary/5">
          <p className="font-medium">Your coach profile is set up - one last step!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Students book specific time slots, so pick your weekly availability in the{" "}
            <a href="#schedule" className="font-medium text-foreground underline underline-offset-2">
              Coaching schedule
            </a>{" "}
            below to start receiving bookings.
          </p>
        </div>
      )}

      {/* Top priority: requests waiting for the user to accept/decline */}
      {pendingIncoming.length > 0 && (
        <section className="mb-8">
          <div className="rounded-lg border border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20 p-4">
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200 mb-3">
              Needs your response
              <span className="ml-2 text-sm font-normal text-amber-800 dark:text-amber-300">
                · {pendingIncoming.length} lesson {pendingIncoming.length === 1 ? "request" : "requests"} from {pendingIncoming.length === 1 ? "a student" : "students"}
              </span>
            </h2>
            <div className="space-y-3">
              {pendingIncoming.map((r) => (
                <PendingRequestCard key={r.id} request={JSON.parse(JSON.stringify(r))} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* You as a student - lessons you've booked */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Student</h2>
        <StudentDashboard
          requests={JSON.parse(JSON.stringify(outgoingRequests))}
          freeTrialsRemaining={currentUser.freeTrialsRemaining}
          hasActiveDispute={currentUser.hasActiveDispute}
          completedTotal={outgoingCompletedTotal}
          otherTotal={outgoingOtherTotal}
        />
      </section>

      {/* You as a coach - lessons your students booked with you */}
      {isCoach && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Coach</h2>
          <CoachDashboard
            requests={JSON.parse(JSON.stringify(incomingRequests))}
            coachAvailability={currentUser.coachAvailability}
            isCoach={isCoach}
            completedTotal={incomingCompletedTotal}
            otherTotal={incomingOtherTotal}
            hasCompletedTrial={!!incomingHasCompletedTrial || currentUser.paidBookingsApproved}
            pendingTrialAutoCompletesAt={
              incomingPendingTrial?.scheduledEndAt
                ? new Date(incomingPendingTrial.scheduledEndAt.getTime() + DISPUTE_WINDOW_MS).toISOString()
                : null
            }
            hasSchedule={weeklyTemplates.length > 0}
            hidePending
          />
        </section>
      )}

      {/* Coaching schedule - pinned to the bottom */}
      {isCoach && (
        <section id="schedule" className="scroll-mt-20">
          <h2 className="text-xl font-semibold mb-3">Coaching</h2>
          <CoachScheduleEditor initialTemplates={weeklyTemplates} timezone={currentUser.timezone} initialAvailability={currentUser.coachAvailability} />
        </section>
      )}
    </div>
  );
}
