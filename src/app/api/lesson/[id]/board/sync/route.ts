import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/pusher";

// POST: Broadcast ephemeral board state (arrows, highlights, navigation) without DB persistence
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const lesson = await prisma.lessonRequest.findUnique({
    where: { id },
    select: { studentId: true, coachId: true, status: true },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (lesson.studentId !== session.user.id && lesson.coachId !== session.user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (lesson.status !== "ACCEPTED" && lesson.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Lesson not active" }, { status: 400 });
  }

  const body = await request.json();
  const { event, data } = body;

  const allowedEvents = ["board:navigate", "board:arrows", "board:highlights", "board:hints", "board:reset", "call:status", "presence:ping", "presence:leave"];
  if (!allowedEvents.includes(event)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  // Ephemeral events are small (arrows, node ids, presence). Cap well below
  // Pusher's ~10KB event limit so oversized payloads are rejected up front.
  if (data != null && JSON.stringify(data).length > 8_192) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const pusher = getPusherServer();
  if (pusher) {
    try {
      await pusher.trigger(`private-lesson-${id}`, event, {
        ...data,
        senderId: session.user.id,
      });
    } catch (err) {
      console.error(`${event} broadcast failed`, err);
    }
  }

  // If reset, clear persisted board state too. Both columns must be cleared:
  // the board seeds from boardTree in preference to boardPgn, so leaving the tree
  // behind would resurrect the cleared moves on the next page load.
  if (event === "board:reset") {
    await prisma.lessonRequest.update({
      where: { id },
      data: { boardPgn: null, boardTree: Prisma.DbNull },
    });
  }

  return NextResponse.json({ ok: true });
}
