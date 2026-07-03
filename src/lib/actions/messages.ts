"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { getPusherServer } from "@/lib/pusher";
import { userChannel, MESSAGE_NEW_EVENT, MESSAGE_READ_EVENT } from "@/lib/notification-channel";
import { directMessageSchema } from "@/lib/validations";
import { blockStudent, unblockStudent } from "@/lib/actions/lessons";

// A user counts as a coach (and so can receive messages) once they've set a
// price - same test used across the profile/search surfaces.
function isCoach(u: { coachChatPrice: number | null; coachCallPrice: number | null }) {
  return !!(u.coachChatPrice || u.coachCallPrice);
}

export interface MessageDTO {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

export interface ConversationPartyDTO {
  id: string;
  username: string | null;
  image: string | null;
}

export interface ConversationSummaryDTO {
  id: string;
  otherParty: ConversationPartyDTO;
  /** The current user's role in this thread. */
  myRole: "coach" | "student";
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ConversationDetailDTO {
  id: string;
  otherParty: ConversationPartyDTO;
  myRole: "coach" | "student";
  messages: MessageDTO[];
  /** Coach has blocked the student via the global Block model. */
  coachBlockedStudent: boolean;
  /** Student has muted the coach on this conversation. */
  studentBlockedCoach: boolean;
  /** Whether the current user may send in this thread right now. */
  canSend: boolean;
}

/**
 * Start (or fetch) the current user's conversation with a coach. Only a student
 * can create a thread; the coach may only ever reply inside an existing one.
 */
export async function startConversation(
  coachId: string
): Promise<{ conversationId: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  if (coachId === me) return { error: "You can't message yourself" };

  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: { id: true, coachChatPrice: true, coachCallPrice: true },
  });
  if (!coach || !isCoach(coach)) return { error: "This user isn't a coach" };

  const meUser = await prisma.user.findUnique({
    where: { id: me },
    select: { isSuspended: true },
  });
  if (meUser?.isSuspended) return { error: "Your account is suspended" };

  // Coach may have blocked this student globally.
  const blocked = await prisma.block.findUnique({
    where: { coachId_studentId: { coachId, studentId: me } },
  });
  if (blocked) return { error: "This coach isn't accepting messages from you." };

  const existing = await prisma.conversation.findUnique({
    where: { coachId_studentId: { coachId, studentId: me } },
    select: { id: true },
  });
  if (existing) return { conversationId: existing.id };

  // Only rate-limit the creation of *new* threads (spraying many coaches).
  const rl = await rateLimit(`dm-new:${me}`, { maxAttempts: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.success) {
    return { error: "You're starting conversations too quickly. Try again later." };
  }

  const convo = await prisma.conversation.create({
    data: { coachId, studentId: me },
    select: { id: true },
  });
  return { conversationId: convo.id };
}

/** Send a message in an existing conversation. */
export async function sendMessage(
  conversationId: string,
  content: string
): Promise<{ message: MessageDTO } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  const parsed = directMessageSchema.safeParse({ content });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid message" };
  }
  const clean = parsed.data.content;

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      coachId: true,
      studentId: true,
      blockedByStudentAt: true,
      _count: { select: { messages: true } },
    },
  });
  if (!convo) return { error: "Conversation not found" };
  if (convo.coachId !== me && convo.studentId !== me) {
    return { error: "Not authorized" };
  }

  const iAmCoach = convo.coachId === me;
  const recipientId = iAmCoach ? convo.studentId : convo.coachId;

  const meUser = await prisma.user.findUnique({
    where: { id: me },
    select: { isSuspended: true, username: true },
  });
  if (meUser?.isSuspended) return { error: "Your account is suspended" };

  // A coach can only ever reply, never open the thread.
  if (iAmCoach && convo._count.messages === 0) {
    return { error: "Coaches can only reply once a student has messaged first." };
  }

  // Blocks: either side being blocked freezes the whole thread.
  if (convo.blockedByStudentAt) {
    return { error: "This conversation is blocked." };
  }
  const globalBlock = await prisma.block.findUnique({
    where: { coachId_studentId: { coachId: convo.coachId, studentId: convo.studentId } },
  });
  if (globalBlock) return { error: "This conversation is blocked." };

  const rl = await rateLimit(`dm-send:${me}`, { maxAttempts: 20, windowMs: 60 * 1000 });
  if (!rl.success) {
    return { error: "You're sending messages too quickly. Slow down a moment." };
  }

  // Whether the recipient already had an unread message from us decides if this
  // send should raise a fresh notification (dedupe bursts into one).
  const priorUnread = await prisma.directMessage.count({
    where: { conversationId, senderId: me, readAt: null },
  });
  const isFirstEver = convo._count.messages === 0;

  const message = await prisma.directMessage.create({
    data: { conversationId, senderId: me, content: clean },
    select: { id: true, senderId: true, content: true, createdAt: true, readAt: true },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.createdAt },
  });

  const dto: MessageDTO = {
    id: message.id,
    senderId: message.senderId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt ? message.readAt.toISOString() : null,
  };

  // Live push to the recipient's personal channel (best-effort).
  try {
    const pusher = getPusherServer();
    if (pusher) {
      await pusher.trigger(userChannel(recipientId), MESSAGE_NEW_EVENT, {
        conversationId,
        message: dto,
        senderName: meUser?.username ?? "Someone",
      });
    }
  } catch (err) {
    console.error("message pusher push failed", err);
  }

  // Notify (bell + first-message email), deduped so a burst is one notification.
  if (priorUnread === 0) {
    await createNotification({
      userId: recipientId,
      type: "NEW_MESSAGE",
      title: `New message from ${meUser?.username ?? "a user"}`,
      body: clean.length > 120 ? `${clean.slice(0, 117)}...` : clean,
      link: `/messages?c=${conversationId}`,
      email: isFirstEver
        ? { subject: `New message from ${meUser?.username ?? "a user"}`, cta: "Open messages" }
        : false,
    });
  }

  revalidatePath("/messages");
  return { message: dto };
}

/** List the current user's conversations for the inbox. */
export async function getConversations(): Promise<ConversationSummaryDTO[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const me = session.user.id;

  const convos = await prisma.conversation.findMany({
    where: { OR: [{ coachId: me }, { studentId: me }] },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      coachId: true,
      lastMessageAt: true,
      coach: { select: { id: true, username: true, image: true } },
      student: { select: { id: true, username: true, image: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true },
      },
      _count: {
        select: { messages: { where: { senderId: { not: me }, readAt: null } } },
      },
    },
  });

  // Hide empty threads (created but never sent) except from the initiator, who
  // needs to see the draft thread they just opened.
  return convos
    .filter((c) => c.messages.length > 0 || c.coachId !== me)
    .map((c) => {
      const iAmCoach = c.coachId === me;
      const other = iAmCoach ? c.student : c.coach;
      return {
        id: c.id,
        otherParty: { id: other.id, username: other.username, image: other.image },
        myRole: iAmCoach ? ("coach" as const) : ("student" as const),
        lastMessagePreview: c.messages[0]?.content ?? null,
        lastMessageAt: c.lastMessageAt.toISOString(),
        unreadCount: c._count.messages,
      };
    });
}

/** Load a single conversation (participant-scoped) with its messages. */
export async function getConversation(
  conversationId: string
): Promise<ConversationDetailDTO | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const me = session.user.id;

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      coachId: true,
      studentId: true,
      blockedByStudentAt: true,
      coach: { select: { id: true, username: true, image: true } },
      student: { select: { id: true, username: true, image: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, senderId: true, content: true, createdAt: true, readAt: true },
      },
    },
  });
  if (!convo) return null;
  if (convo.coachId !== me && convo.studentId !== me) return null;

  const iAmCoach = convo.coachId === me;
  const other = iAmCoach ? convo.student : convo.coach;

  const globalBlock = await prisma.block.findUnique({
    where: { coachId_studentId: { coachId: convo.coachId, studentId: convo.studentId } },
  });
  const meUser = await prisma.user.findUnique({
    where: { id: me },
    select: { isSuspended: true },
  });

  const coachBlockedStudent = !!globalBlock;
  const studentBlockedCoach = !!convo.blockedByStudentAt;
  const canSend =
    !meUser?.isSuspended &&
    !coachBlockedStudent &&
    !studentBlockedCoach &&
    // Coach can't send the opening message.
    !(iAmCoach && convo.messages.length === 0);

  return {
    id: convo.id,
    otherParty: { id: other.id, username: other.username, image: other.image },
    myRole: iAmCoach ? "coach" : "student",
    messages: convo.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    })),
    coachBlockedStudent,
    studentBlockedCoach,
    canSend,
  };
}

/** Mark the other party's messages as read and notify them (read receipts). */
export async function markConversationRead(
  conversationId: string
): Promise<{ success: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, coachId: true, studentId: true },
  });
  if (!convo) return { error: "Conversation not found" };
  if (convo.coachId !== me && convo.studentId !== me) return { error: "Not authorized" };

  const updated = await prisma.directMessage.updateMany({
    where: { conversationId, senderId: { not: me }, readAt: null },
    data: { readAt: new Date() },
  });

  if (updated.count > 0) {
    const senderId = convo.coachId === me ? convo.studentId : convo.coachId;
    try {
      const pusher = getPusherServer();
      if (pusher) {
        await pusher.trigger(userChannel(senderId), MESSAGE_READ_EVENT, { conversationId });
      }
    } catch (err) {
      console.error("read-receipt pusher push failed", err);
    }
  }
  return { success: true };
}

/** Block the other participant. Coach->student reuses the global block. */
export async function blockConversationParty(
  conversationId: string
): Promise<{ success: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, coachId: true, studentId: true },
  });
  if (!convo) return { error: "Conversation not found" };
  if (convo.coachId !== me && convo.studentId !== me) return { error: "Not authorized" };

  if (convo.coachId === me) {
    // Unified block: also stops bookings + cancels pending requests.
    const res = await blockStudent(convo.studentId);
    if ("error" in res) return { error: res.error ?? "Failed to block user" };
  } else {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { blockedByStudentAt: new Date() },
    });
  }
  revalidatePath("/messages");
  return { success: true };
}

/** Unblock the other participant (mirror of blockConversationParty). */
export async function unblockConversationParty(
  conversationId: string
): Promise<{ success: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, coachId: true, studentId: true },
  });
  if (!convo) return { error: "Conversation not found" };
  if (convo.coachId !== me && convo.studentId !== me) return { error: "Not authorized" };

  if (convo.coachId === me) {
    await unblockStudent(convo.studentId);
  } else {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { blockedByStudentAt: null },
    });
  }
  revalidatePath("/messages");
  return { success: true };
}

/** Report the other participant; creates an AbuseFlag for admin review. */
export async function reportConversation(
  conversationId: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  const trimmed = reason.trim();
  if (trimmed.length < 3) return { error: "Please describe the problem." };
  if (trimmed.length > 1000) return { error: "Reason is too long." };

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, coachId: true, studentId: true },
  });
  if (!convo) return { error: "Conversation not found" };
  if (convo.coachId !== me && convo.studentId !== me) return { error: "Not authorized" };

  const reportedId = convo.coachId === me ? convo.studentId : convo.coachId;

  // Light rate limit so the report action can't be spammed.
  const rl = await rateLimit(`dm-report:${me}`, { maxAttempts: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.success) return { error: "You've reported too many times recently." };

  await prisma.abuseFlag.create({
    data: {
      userId: reportedId,
      type: "MESSAGE_ABUSE",
      severity: "MEDIUM",
      relatedUserId: me,
      details: `Messaging report (conversation ${conversationId}): ${trimmed}`,
    },
  });
  return { success: true };
}

/** Total unread direct messages for the current user (navbar badge). */
export async function getUnreadMessageCount(): Promise<number> {
  const session = await auth();
  if (!session?.user?.id) return 0;
  const me = session.user.id;

  return prisma.directMessage.count({
    where: {
      senderId: { not: me },
      readAt: null,
      conversation: { OR: [{ coachId: me }, { studentId: me }] },
    },
  });
}
