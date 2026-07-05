"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { sendNotificationEmail, emailText } from "@/lib/email";
import { getPusherServer } from "@/lib/pusher";
import { userChannel, MESSAGE_NEW_EVENT, MESSAGE_READ_EVENT } from "@/lib/notification-channel";
import { directMessageSchema } from "@/lib/validations";
import { blockUser, unblockUser } from "@/lib/actions/lessons";

// Participants are stored canonically (A < B) so there is one thread per pair
// regardless of who started it.
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
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
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ConversationDetailDTO {
  id: string;
  otherParty: ConversationPartyDTO;
  messages: MessageDTO[];
  /** The current user has blocked the other party. */
  iBlockedThem: boolean;
  /** The other party has blocked the current user. */
  theyBlockedMe: boolean;
  /** Whether the current user may send in this thread right now. */
  canSend: boolean;
}

/** Fetch the two participant ids for a conversation, scoped to the caller. */
async function loadParticipants(conversationId: string, me: string) {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, participantAId: true, participantBId: true },
  });
  if (!convo) return null;
  if (convo.participantAId !== me && convo.participantBId !== me) return null;
  const otherId = convo.participantAId === me ? convo.participantBId : convo.participantAId;
  return { convo, otherId };
}

/** Is there a block in either direction between two users? */
async function blockBetween(a: string, b: string) {
  const blocks = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
  });
  return {
    aBlockedB: blocks.some((x) => x.blockerId === a),
    bBlockedA: blocks.some((x) => x.blockerId === b),
    any: blocks.length > 0,
  };
}

/**
 * Start (or fetch) the current user's conversation with another user. Anyone can
 * message anyone; there is exactly one thread per pair.
 */
export async function startConversation(
  targetId: string
): Promise<{ conversationId: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  if (targetId === me) return { error: "You can't message yourself" };

  const [target, meUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: me }, select: { isSuspended: true } }),
  ]);
  if (!target) return { error: "User not found" };
  if (meUser?.isSuspended) return { error: "Your account is suspended" };

  const blocks = await blockBetween(me, targetId);
  if (blocks.bBlockedA) return { error: "This user isn't accepting messages from you." };
  if (blocks.aBlockedB) return { error: "You've blocked this user. Unblock them to message." };

  const [pa, pb] = canonicalPair(me, targetId);
  const existing = await prisma.conversation.findUnique({
    where: { participantAId_participantBId: { participantAId: pa, participantBId: pb } },
    select: { id: true },
  });
  if (existing) return { conversationId: existing.id };

  // Only rate-limit the creation of *new* threads (spraying many people).
  const rl = await rateLimit(`dm-new:${me}`, { maxAttempts: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.success) {
    return { error: "You're starting conversations too quickly. Try again later." };
  }

  const convo = await prisma.conversation.create({
    data: { participantAId: pa, participantBId: pb },
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

  const loaded = await loadParticipants(conversationId, me);
  if (!loaded) return { error: "Conversation not found" };
  const recipientId = loaded.otherId;

  const meUser = await prisma.user.findUnique({
    where: { id: me },
    select: { isSuspended: true, username: true },
  });
  if (meUser?.isSuspended) return { error: "Your account is suspended" };

  // A block in either direction freezes the thread.
  const blocks = await blockBetween(me, recipientId);
  if (blocks.any) return { error: "This conversation is blocked." };

  const rl = await rateLimit(`dm-send:${me}`, { maxAttempts: 20, windowMs: 60 * 1000 });
  if (!rl.success) {
    return { error: "You're sending messages too quickly. Slow down a moment." };
  }

  // Email only on the very first message of the thread. New DMs surface in-app
  // through the dedicated Messages badge (account menu), not the notification
  // bell, so we don't double-notify for the same event.
  const totalMessages = await prisma.directMessage.count({ where: { conversationId } });
  const isFirstEver = totalMessages === 0;

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

  if (isFirstEver) {
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { email: true },
      });
      if (recipient?.email) {
        const senderName = meUser?.username ?? "a user";
        const preview = clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
        await sendNotificationEmail({
          to: recipient.email,
          subject: `New message from ${senderName}`,
          heading: `New message from ${senderName}`,
          bodyHtml: `<p>${emailText(preview)}</p>`,
          link: `/messages?c=${conversationId}`,
          cta: "Open messages",
        });
      }
    } catch (err) {
      console.error("message email failed", err);
    }
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
    where: { OR: [{ participantAId: me }, { participantBId: me }] },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      participantAId: true,
      lastMessageAt: true,
      participantA: { select: { id: true, username: true, image: true } },
      participantB: { select: { id: true, username: true, image: true } },
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

  // Hide threads with no messages yet (created but never sent). The initiator
  // still opens theirs via ?c= straight into the thread pane.
  return convos
    .filter((c) => c.messages.length > 0)
    .map((c) => {
      const other = c.participantAId === me ? c.participantB : c.participantA;
      return {
        id: c.id,
        otherParty: { id: other.id, username: other.username, image: other.image },
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
      participantAId: true,
      participantBId: true,
      participantA: { select: { id: true, username: true, image: true } },
      participantB: { select: { id: true, username: true, image: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, senderId: true, content: true, createdAt: true, readAt: true },
      },
    },
  });
  if (!convo) return null;
  if (convo.participantAId !== me && convo.participantBId !== me) return null;

  const other = convo.participantAId === me ? convo.participantB : convo.participantA;

  const [blocks, meUser] = await Promise.all([
    blockBetween(me, other.id),
    prisma.user.findUnique({ where: { id: me }, select: { isSuspended: true } }),
  ]);

  const canSend = !meUser?.isSuspended && !blocks.any;

  return {
    id: convo.id,
    otherParty: { id: other.id, username: other.username, image: other.image },
    messages: convo.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    })),
    iBlockedThem: blocks.aBlockedB,
    theyBlockedMe: blocks.bBlockedA,
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

  const loaded = await loadParticipants(conversationId, me);
  if (!loaded) return { error: "Not authorized" };

  const updated = await prisma.directMessage.updateMany({
    where: { conversationId, senderId: { not: me }, readAt: null },
    data: { readAt: new Date() },
  });

  if (updated.count > 0) {
    try {
      const pusher = getPusherServer();
      if (pusher) {
        await pusher.trigger(userChannel(loaded.otherId), MESSAGE_READ_EVENT, { conversationId });
      }
    } catch (err) {
      console.error("read-receipt pusher push failed", err);
    }
  }
  return { success: true };
}

/** Block the other participant (unified: also stops bookings between them). */
export async function blockConversationParty(
  conversationId: string
): Promise<{ success: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  const loaded = await loadParticipants(conversationId, me);
  if (!loaded) return { error: "Not authorized" };

  const res = await blockUser(loaded.otherId);
  if ("error" in res) return { error: res.error ?? "Failed to block user" };
  return { success: true };
}

/** Unblock the other participant. */
export async function unblockConversationParty(
  conversationId: string
): Promise<{ success: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  const me = session.user.id;

  const loaded = await loadParticipants(conversationId, me);
  if (!loaded) return { error: "Not authorized" };

  await unblockUser(loaded.otherId);
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

  const loaded = await loadParticipants(conversationId, me);
  if (!loaded) return { error: "Not authorized" };

  // Light rate limit so the report action can't be spammed.
  const rl = await rateLimit(`dm-report:${me}`, { maxAttempts: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.success) return { error: "You've reported too many times recently." };

  await prisma.abuseFlag.create({
    data: {
      userId: loaded.otherId,
      type: "MESSAGE_ABUSE",
      severity: "MEDIUM",
      relatedUserId: me,
      details: `Messaging report (conversation ${conversationId}): ${trimmed}`,
    },
  });
  return { success: true };
}

export interface UserSearchResultDTO {
  id: string;
  username: string | null;
  image: string | null;
}

/**
 * Search users by username so you can start a new conversation with someone
 * even without a prior thread or a shared lesson. Excludes yourself and anyone
 * blocked in either direction, so every result is actually messageable.
 */
export async function searchUsersToMessage(query: string): Promise<UserSearchResultDTO[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const me = session.user.id;

  const q = query.trim();
  if (q.length < 2) return [];

  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: me }, { blockedId: me }] },
    select: { blockerId: true, blockedId: true },
  });
  const excludeIds = new Set<string>([me]);
  for (const b of blocks) {
    excludeIds.add(b.blockerId === me ? b.blockedId : b.blockerId);
  }

  return prisma.user.findMany({
    where: {
      username: { contains: q, mode: "insensitive" },
      id: { notIn: [...excludeIds] },
      isSuspended: false,
    },
    select: { id: true, username: true, image: true },
    orderBy: { username: "asc" },
    take: 8,
  });
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
      conversation: { OR: [{ participantAId: me }, { participantBId: me }] },
    },
  });
}
