import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LessonSession } from "@/components/lesson/lesson-session";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const lesson = await prisma.lessonRequest.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, username: true } },
      coach: { select: { id: true, username: true } },
      chatMessages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          senderId: true,
          content: true,
          createdAt: true,
          readAt: true,
        },
      },
    },
  });

  if (!lesson) notFound();

  const isCoach = lesson.coachId === session.user.id;
  const isStudent = lesson.studentId === session.user.id;
  if (!isCoach && !isStudent) notFound();

  // Allow access for ACCEPTED or IN_PROGRESS lessons.
  // The room opens 5 minutes before the scheduled start and closes 5 minutes
  // after the scheduled end (grace period so student and coach can wrap up).
  const GRACE_MS = 5 * 60 * 1000;
  const EARLY_JOIN_MS = 5 * 60 * 1000;
  // eslint-disable-next-line react-hooks/purity -- Server Component: rendered once per request.
  const nowMs = Date.now();
  const isAllowedStatus = lesson.status === "ACCEPTED" || lesson.status === "IN_PROGRESS";
  const beforeJoinWindow =
    lesson.scheduledStartAt &&
    nowMs < new Date(lesson.scheduledStartAt).getTime() - EARLY_JOIN_MS;
  const pastGrace =
    lesson.scheduledEndAt &&
    nowMs > new Date(lesson.scheduledEndAt).getTime() + GRACE_MS;
  if (!isAllowedStatus || beforeJoinWindow || pastGrace) {
    redirect("/dashboard");
  }

  // Record this party's join timestamp, then keep the in-memory copy in sync.
  if (isCoach && !lesson.coachJoinedAt) {
    const joinedAt = new Date();
    await prisma.lessonRequest.update({
      where: { id },
      data: { coachJoinedAt: joinedAt },
    });
    lesson.coachJoinedAt = joinedAt;
  }
  if (isStudent && !lesson.studentJoinedAt) {
    const joinedAt = new Date();
    await prisma.lessonRequest.update({
      where: { id },
      data: { studentJoinedAt: joinedAt },
    });
    lesson.studentJoinedAt = joinedAt;
  }

  // Auto-transition to IN_PROGRESS once both parties have joined. The guard
  // reads the *committed* join timestamps in the DB, not this request's stale
  // snapshot: if both sides open the room near-simultaneously, each would
  // otherwise see the other's timestamp as null and neither would flip the
  // status, stranding the lesson in ACCEPTED forever (no sweep completes it,
  // so the student's funds stay reserved and the coach is never paid).
  if (lesson.status === "ACCEPTED") {
    const flipped = await prisma.lessonRequest.updateMany({
      where: {
        id,
        status: "ACCEPTED",
        coachJoinedAt: { not: null },
        studentJoinedAt: { not: null },
      },
      data: { status: "IN_PROGRESS" },
    });
    if (flipped.count > 0) lesson.status = "IN_PROGRESS";
  }

  return (
    <div className="h-[calc(100dvh-4rem)]">
      <LessonSession
        lessonId={lesson.id}
        userId={session.user.id}
        isCoach={isCoach}
        coachName={lesson.coach.username ?? "Coach"}
        studentName={lesson.student.username ?? "Student"}
        scheduledStartAt={lesson.scheduledStartAt?.toISOString() ?? null}
        scheduledEndAt={lesson.scheduledEndAt?.toISOString() ?? null}
        communicationMethod={lesson.communicationMethod}
        initialMessages={JSON.parse(JSON.stringify(lesson.chatMessages))}
        otherJoined={isCoach ? !!lesson.studentJoinedAt : !!lesson.coachJoinedAt}
        initialBoardPgn={lesson.boardPgn ?? ""}
        initialBoardTree={lesson.boardTree ?? null}
      />
    </div>
  );
}
