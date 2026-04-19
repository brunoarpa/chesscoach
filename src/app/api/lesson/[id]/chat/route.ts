import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const body = await request.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content || content.length > 1000) {
    return NextResponse.json({ error: "Message must be 1-1000 characters" }, { status: 400 });
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

  return NextResponse.json({ message });
}
