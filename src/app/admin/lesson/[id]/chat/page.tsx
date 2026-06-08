import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LocalTime } from "@/components/local-time";

export default async function AdminLessonChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") notFound();

  const { id } = await params;

  const lesson = await prisma.lessonRequest.findUnique({
    where: { id },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
      chatMessages: {
        orderBy: { createdAt: "asc" },
        include: {
          sender: { select: { username: true } },
        },
      },
    },
  });

  if (!lesson) notFound();

  return (
    <div className="container max-w-3xl py-8 mx-auto">
      <h1 className="text-xl font-bold mb-2">Chat History</h1>
      <div className="text-sm text-muted-foreground mb-4 space-y-1">
        <p>Lesson ID: {lesson.id}</p>
        <p>Student: {lesson.student.username ?? "Unknown"} · Coach: {lesson.coach.username ?? "Unknown"}</p>
        <p>Status: {lesson.status}</p>
        {lesson.scheduledStartAt && (
          <p>
            Scheduled: <LocalTime iso={lesson.scheduledStartAt.toISOString()} />
            {lesson.scheduledEndAt && <> – <LocalTime iso={lesson.scheduledEndAt.toISOString()} /></>}
          </p>
        )}
        <p>
          Coach joined: {lesson.coachJoinedAt ? <LocalTime iso={lesson.coachJoinedAt.toISOString()} /> : "Never"} ·
          Student joined: {lesson.studentJoinedAt ? <LocalTime iso={lesson.studentJoinedAt.toISOString()} /> : "Never"}
        </p>
        {lesson.disputeReason && (
          <p className="text-destructive">Dispute reason: {lesson.disputeReason}</p>
        )}
      </div>

      <div className="border rounded-lg divide-y">
        {lesson.chatMessages.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">No messages</p>
        ) : (
          lesson.chatMessages.map((msg) => (
            <div key={msg.id} className="p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{msg.sender.username ?? "Unknown"}</span>
                <span className="text-xs text-muted-foreground">
                  <LocalTime iso={msg.createdAt.toISOString()} />
                </span>
                {msg.senderId === lesson.coachId && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">Coach</span>
                )}
                {msg.senderId === lesson.studentId && (
                  <span className="text-xs bg-green-100 text-green-800 px-1 rounded">Student</span>
                )}
              </div>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
