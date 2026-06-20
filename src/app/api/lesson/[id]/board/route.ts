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

  // Size caps: a 15-minute lesson's moves are a few KB at most. These bounds
  // are generous headroom for legitimate variation trees while stopping a
  // participant from writing unbounded JSON into the row on every keystroke.
  const MAX_PGN_CHARS = 20_000;
  const MAX_TREE_CHARS = 200_000;
  if (typeof boardPgn === "string" && boardPgn.length > MAX_PGN_CHARS) {
    return NextResponse.json({ error: "Board state too large" }, { status: 413 });
  }
  if (boardTree != null && JSON.stringify(boardTree).length > MAX_TREE_CHARS) {
    return NextResponse.json({ error: "Board state too large" }, { status: 413 });
  }

  // Persist the main-line PGN (backward-compat) and the full variation tree.
  if (typeof boardPgn === "string") {
    await prisma.lessonRequest.update({
      where: { id },
      data: { boardPgn, boardTree: boardTree ?? null },
    });
  }

  // Broadcast move update via Pusher. Best-effort: the DB row is the source of
  // truth, so a failed broadcast must not fail the request after the state was
  // already persisted.
  const pusher = getPusherServer();
  if (pusher) {
    const payload = {
      tree: boardTree,
      currentNodeId,
      senderId: session.user.id,
    };
    const refetchPing = { currentNodeId, senderId: session.user.id };
    // Pusher rejects events over 10KB (HTTP 413), and a real lesson's
    // variation tree blows past that well before our DB size caps. Past the
    // threshold, broadcast a tiny "refetch" ping instead - the other client
    // pulls the persisted tree from GET, which has no such limit.
    const PUSHER_SAFE_BYTES = 9_000;
    try {
      if (JSON.stringify(payload).length > PUSHER_SAFE_BYTES) {
        await pusher.trigger(`private-lesson-${id}`, "board:refetch", refetchPing);
      } else {
        await pusher.trigger(`private-lesson-${id}`, "board:moves", payload);
      }
    } catch (err) {
      // Whatever the reason the full payload was rejected, the tiny ping
      // should still go through and keep the boards in sync.
      try {
        await pusher.trigger(`private-lesson-${id}`, "board:refetch", refetchPing);
      } catch {
        console.error("board sync broadcast failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
