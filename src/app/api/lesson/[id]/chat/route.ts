import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/pusher";
import { rateLimit } from "@/lib/rate-limit";

const MAX_MESSAGE_LENGTH = 100;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  // Verify the user is a participant
  const lesson = await prisma.lessonRequest.findUnique({
    where: { id },
    select: { studentId: true, coachId: true },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (lesson.studentId !== session.user.id && lesson.coachId !== session.user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { lessonRequestId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      senderId: true,
      content: true,
      createdAt: true,
      readAt: true,
    },
  });

  // Mark unread messages from the other user as read
  await prisma.chatMessage.updateMany({
    where: {
      lessonRequestId: id,
      senderId: { not: session.user.id },
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ messages });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  // Verify the user is a participant
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
    return NextResponse.json({ error: "Lesson is not active" }, { status: 400 });
  }

  // Rate limit: max 10 messages per 10 seconds per user per lesson, to
  // prevent flooding/spam from a participant in the room.
  const { success } = await rateLimit(`chat:${id}:${session.user.id}`, {
    maxAttempts: 10,
    windowMs: 10 * 1000,
  });
  if (!success) {
    return NextResponse.json(
      { error: "You're sending messages too quickly. Please slow down." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` },
      { status: 400 }
    );
  }

  const message = await prisma.chatMessage.create({
    data: {
      lessonRequestId: id,
      senderId: session.user.id,
      content,
    },
    select: {
      id: true,
      senderId: true,
      content: true,
      createdAt: true,
      readAt: true,
    },
  });

  // Broadcast via Pusher for real-time delivery
  const pusher = getPusherServer();
  if (pusher) {
    await pusher.trigger(`private-lesson-${id}`, "chat:message", {
      message: JSON.parse(JSON.stringify(message)),
    });
  }

  return NextResponse.json({ message });
}
