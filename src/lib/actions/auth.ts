"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { chessComUsernameExists, fetchChessComProfile, fetchChessComRating, fetchChessComLocation } from "@/lib/chess-com";
import { filterValidLanguages } from "@/lib/languages";
import { generateUpcomingSlots } from "@/lib/actions/timeslots";
import crypto from "crypto";

export async function setUsername(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const username = (formData.get("username") as string)?.trim();
  if (!username) return { error: "Username is required" };
  if (username.length < 3 || username.length > 20) {
    return { error: "Username must be between 3 and 20 characters" };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { error: "Username can only contain letters, numbers, and underscores" };
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && existing.id !== session.user.id) {
    return { error: "Username already taken" };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { username },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  const rawBio = (formData.get("bio") as string)?.trim() || undefined;
  if (rawBio && rawBio.length > 500) {
    return { error: "Bio must be 500 characters or fewer." };
  }

  const rawTimezone = (formData.get("timezone") as string) || undefined;
  if (rawTimezone && rawTimezone.length > 64) {
    return { error: "Invalid timezone." };
  }
  // Must be a real IANA zone — slot generation feeds it to Intl.DateTimeFormat,
  // which throws on unknown zones and would break the coach's schedule later.
  if (rawTimezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: rawTimezone });
    } catch {
      return { error: "Invalid timezone." };
    }
  }

  const raw = {
    username: (formData.get("username") as string)?.trim() || undefined,
    continent: (formData.get("continent") as string) || undefined,
    coachChatPrice: formData.get("coachChatPrice")
      ? Number(formData.get("coachChatPrice"))
      : undefined,
    coachCallPrice: formData.get("coachCallPrice")
      ? Number(formData.get("coachCallPrice"))
      : undefined,
    communicationPreference:
      (formData.get("communicationPreference") as string) || "CHAT_ONLY",
    bio: rawBio,
    timezone: rawTimezone,
    languages: filterValidLanguages(
      formData.getAll("languages").map((v) => String(v)),
    ),
  };

  // Validate price ranges (in dollars, before *100)
  const MAX_PRICE_USD = 200; // $200 per 15 minutes is plenty
  if (raw.coachChatPrice !== undefined && (raw.coachChatPrice < 0 || raw.coachChatPrice > MAX_PRICE_USD || !Number.isFinite(raw.coachChatPrice))) {
    return { error: `Chat price must be between $0 and $${MAX_PRICE_USD}.` };
  }
  if (raw.coachCallPrice !== undefined && (raw.coachCallPrice < 0 || raw.coachCallPrice > MAX_PRICE_USD || !Number.isFinite(raw.coachCallPrice))) {
    return { error: `Call price must be between $0 and $${MAX_PRICE_USD}.` };
  }

  // Validate and handle username change
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, coachChatPrice: true, coachCallPrice: true, timezone: true },
  });
  let newUsername = currentUser?.username ?? null;
  if (raw.username && raw.username !== currentUser?.username) {
    if (raw.username.length < 3 || raw.username.length > 20) {
      return { error: "Username must be between 3 and 20 characters" };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(raw.username)) {
      return { error: "Username can only contain letters, numbers, and underscores" };
    }
    const existingUser = await prisma.user.findUnique({ where: { username: raw.username } });
    if (existingUser && existingUser.id !== session.user.id) {
      return { error: "Username already taken" };
    }
    newUsername = raw.username;
  }

  const chatPriceInCents = raw.coachChatPrice ? Math.round(raw.coachChatPrice * 100) : null;
  const callPriceInCents = raw.coachCallPrice ? Math.round(raw.coachCallPrice * 100) : null;

  // Pausing/resuming bookings lives on the schedule editor (updateCoachAvailability),
  // which enforces the price + language requirements. Profile edits deliberately
  // leave coachAvailability untouched so saving the form can't silently un-pause
  // a coach.

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      username: newUsername,
      continent: raw.continent as "AFRICA" | "ASIA" | "EUROPE" | "NORTH_AMERICA" | "SOUTH_AMERICA" | "OCEANIA" | undefined,
      coachChatPrice: chatPriceInCents,
      coachCallPrice: callPriceInCents,
      communicationPreference: raw.communicationPreference as "CHAT_ONLY" | "CHAT_AND_CALL",
      bio: raw.bio || null,
      timezone: raw.timezone || null,
      languages: raw.languages,
      lastActiveAt: new Date(),
      activityStatus: "ACTIVE",
    },
  });

  // A timezone change invalidates every future template-generated slot: the
  // stored TimeSlots are UTC instants materialized under the OLD timezone, so
  // they no longer match the wall-clock hours the coach picked. Drop the
  // regenerable ones and rebuild under the new timezone. Booked slots stay —
  // both parties committed to those exact instants.
  const timezoneChanged = (raw.timezone ?? null) !== (currentUser?.timezone ?? null);
  if (timezoneChanged) {
    const nowTs = new Date();
    await prisma.timeSlot.deleteMany({
      where: {
        coachId: session.user.id,
        startTime: { gt: nowTs },
        status: { in: ["AVAILABLE", "UNAVAILABLE"] },
        lessonRequests: { none: {} },
      },
    });
    // Stale slots referenced by old (declined/expired) requests can't be
    // deleted; hide them so students can't book times that no longer match
    // the coach's schedule.
    await prisma.timeSlot.updateMany({
      where: { coachId: session.user.id, startTime: { gt: nowTs }, status: "AVAILABLE" },
      data: { status: "UNAVAILABLE" },
    });
    await generateUpcomingSlots(session.user.id);
  }

  // Onboarding hand-off: someone who just set their first coaching price has
  // become bookable in principle, but students can only book concrete time
  // slots — so send them straight to the schedule editor instead of their
  // profile. Only fires on the no-price -> price transition with no weekly
  // template yet, so ordinary profile edits keep the normal redirect.
  const wasCoach = !!(currentUser?.coachChatPrice || currentUser?.coachCallPrice);
  const isNowCoach = !!(chatPriceInCents || callPriceInCents);
  if (!wasCoach && isNowCoach) {
    const templateCount = await prisma.timeSlotTemplate.count({
      where: { coachId: session.user.id },
    });
    if (templateCount === 0) {
      redirect("/dashboard?setup=schedule");
    }
  }

  if (newUsername) {
    redirect("/profile/" + newUsername);
  }
  redirect("/profile/edit");
}

export async function updateCoachAvailability(newStatus: "AVAILABLE" | "UNAVAILABLE") {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  if (newStatus === "AVAILABLE") {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { coachChatPrice: true, coachCallPrice: true, languages: true },
    });
    if (!user?.coachChatPrice && !user?.coachCallPrice) {
      return { error: "You must set a price before setting yourself as available. Go to Edit Profile to set your price." };
    }
    if (!user.languages || user.languages.length === 0) {
      return { error: "You must select at least one language you teach in before becoming available. Go to Edit Profile." };
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      coachAvailability: newStatus,
      lastActiveAt: new Date(),
      activityStatus: "ACTIVE",
    },
  });

  revalidatePath("/dashboard");
  return { success: true, status: newStatus };
}

export async function submitChessComUsername(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { verificationStatus: true },
  });
  if (!currentUser) return { error: "User not found" };
  if (currentUser.verificationStatus === "VERIFIED") {
    return { error: "Your account is already verified" };
  }

  // chess.com usernames are case-insensitive — store lowercase so the same
  // account can't be linked to two users under different casings.
  const chessComUsername = (formData.get("chessComUsername") as string)?.trim().toLowerCase();
  if (!chessComUsername) return { error: "Chess.com username is required" };

  const exists = await chessComUsernameExists(chessComUsername);
  if (!exists) {
    return { error: "This chess.com username was not found. Please check the spelling." };
  }

  const existing = await prisma.user.findUnique({ where: { chessComUsername } });
  if (existing && existing.id !== session.user.id) {
    return { error: "This chess.com username is already linked to another account" };
  }

  // Generate a unique verification code
  const verificationCode = crypto.randomBytes(4).toString("hex").toUpperCase();

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      chessComUsername,
      verificationCode,
      verificationStatus: "PENDING",
    },
  });

  return { success: true, verificationCode };
}

export async function verifyChessComLocation() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  // Rate limit verification attempts — chess.com API check is external and can be abused.
  const { rateLimit } = await import("@/lib/rate-limit");
  const { success: rlSuccess } = await rateLimit(`verify-chess-com:${session.user.id}`, { maxAttempts: 10, windowMs: 60 * 60 * 1000 });
  if (!rlSuccess) {
    return { error: "Too many verification attempts. Try again in an hour." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { chessComUsername: true, verificationCode: true, verificationStatus: true },
  });

  if (!user) return { error: "User not found" };
  if (user.verificationStatus === "VERIFIED") return { error: "Already verified" };
  if (!user.chessComUsername || !user.verificationCode) {
    return { error: "Please submit your chess.com username first" };
  }

  // Fetch location from chess.com API
  const location = await fetchChessComLocation(user.chessComUsername);
  if (location === null) {
    return { error: "Could not fetch your chess.com profile. Try again." };
  }

  if (!location.toUpperCase().includes(user.verificationCode)) {
    return { error: `Verification code not found in your chess.com location. Make sure your Location field contains: ${user.verificationCode}` };
  }

  // Verification passed — fetch rating and profile
  const [rating, profile] = await Promise.all([
    fetchChessComRating(user.chessComUsername),
    fetchChessComProfile(user.chessComUsername),
  ]);

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      verificationStatus: "VERIFIED",
      chessRating: rating,
      chessComAccountAge: profile?.joined ?? null,
      verificationCode: null,
    },
  });

  revalidatePath("/dashboard");
  return { success: true };
}
