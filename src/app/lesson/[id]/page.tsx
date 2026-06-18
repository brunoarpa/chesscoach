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

  // Record join timestamp
  if (isCoach && !lesson.coachJoinedAt) {
    await prisma.lessonRequest.update({
      where: { id },
      data: { coachJoinedAt: new Date() },
    });
  }
  if (isStudent && !lesson.studentJoinedAt) {
    await prisma.lessonRequest.update({
      where: { id },
      data: { studentJoinedAt: new Date() },
    });
  }

  // Auto-transition to IN_PROGRESS if both have joined and status is ACCEPTED
  if (lesson.status === "ACCEPTED") {
    const coachJoined = isCoach || !!lesson.coachJoinedAt;
    const studentJoined = isStudent || !!lesson.studentJoinedAt;
    if (coachJoined && studentJoined) {
      await prisma.lessonRequest.update({
        where: { id },
        data: { status: "IN_PROGRESS" },
      });
      lesson.status = "IN_PROGRESS";
    }
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
