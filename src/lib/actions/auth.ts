"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { chessComUsernameExists, fetchChessComProfile, fetchChessComRating, fetchChessComLocation } from "@/lib/chess-com";
import { filterValidLanguages } from "@/lib/languages";
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
    bio: (formData.get("bio") as string) || undefined,
    coachAvailability: (formData.get("coachAvailability") as string) || "AVAILABLE",
    timezone: (formData.get("timezone") as string) || undefined,
    languages: filterValidLanguages(
      formData.getAll("languages").map((v) => String(v)),
    ),
  };

  // Validate and handle username change
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
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
  const availability = raw.coachAvailability as "AVAILABLE" | "UNAVAILABLE";
  const hasPrice = chatPriceInCents !== null || callPriceInCents !== null;
  const hasLanguages = raw.languages.length > 0;

  if (availability === "AVAILABLE") {
    if (!hasPrice && !hasLanguages) {
      return { error: "To be available as a coach, set a chat or call price and select at least one language you teach in." };
    }
    if (!hasPrice) {
      return { error: "To be available as a coach, set a chat or call price." };
    }
    if (!hasLanguages) {
      return { error: "To be available as a coach, select at least one language you teach in." };
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      username: newUsername,
      continent: raw.continent as "AFRICA" | "ASIA" | "EUROPE" | "NORTH_AMERICA" | "SOUTH_AMERICA" | "OCEANIA" | undefined,
      coachChatPrice: chatPriceInCents,
      coachCallPrice: callPriceInCents,
      communicationPreference: raw.communicationPreference as "CHAT_ONLY" | "CHAT_AND_CALL",
      bio: raw.bio || null,
      coachAvailability: availability,
      timezone: raw.timezone || null,
      languages: raw.languages,
      lastActiveAt: new Date(),
      activityStatus: "ACTIVE",
    },
  });

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

  const chessComUsername = formData.get("chessComUsername") as string;
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
