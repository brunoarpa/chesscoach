import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/pusher";

// GET: Load persisted board state
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const lesson = await prisma.lessonRequest.findUnique({
    where: { id },
    select: { studentId: true, coachId: true, boardPgn: true, boardTree: true },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (lesson.studentId !== session.user.id && lesson.coachId !== session.user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json({ boardPgn: lesson.boardPgn ?? "", boardTree: lesson.boardTree ?? null });
}

// PATCH: Persist board state + broadcast via Pusher
export async function PATCH(
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
  const { boardPgn, boardTree, currentNodeId } = body;

  // Persist the main-line PGN (backward-compat) and the full variation tree.
  if (typeof boardPgn === "string") {
    await prisma.lessonRequest.update({
      where: { id },
      data: { boardPgn, boardTree: boardTree ?? null },
    });
  }

  // Broadcast move update via Pusher
  const pusher = getPusherServer();
  if (pusher) {
    await pusher.trigger(`private-lesson-${id}`, "board:moves", {
      tree: boardTree,
      currentNodeId,
      senderId: session.user.id,
    });
  }

  return NextResponse.json({ ok: true });
}
