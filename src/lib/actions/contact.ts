"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const MAX_MESSAGE_LENGTH = 2000;

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function submitContactMessage(formData: FormData) {
  const session = await auth();

  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "Please enter a valid email so we can reply." };

  const rawMessage = formData.get("message");
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (!message) return { error: "Please write a message." };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message is too long (${MAX_MESSAGE_LENGTH} characters max).` };
  }

  // Key on user id when signed in so changing the email field doesn't reset the limit.
  const rlKey = session?.user?.id ? `contact:${session.user.id}` : `contact:${email}`;
  const { success: rlOk } = await rateLimit(rlKey, {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlOk) return { error: "Too many messages. Try again later." };

  await prisma.contactMessage.create({
    data: {
      email,
      message,
      userId: session?.user?.id ?? null,
      username: session?.user?.username ?? null,
    },
  });

  return { success: true };
}
