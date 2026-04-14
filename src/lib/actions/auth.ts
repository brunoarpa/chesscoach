"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validations";
import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { chessComUsernameExists } from "@/lib/chess-com";

async function getClientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}

export async function signup(formData: FormData) {
  const ip = await getClientIp();
  const { success } = rateLimit(`signup:${ip}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
  if (!success) {
    return { error: "Too many signup attempts. Please try again later." };
  }

  const raw = {
    username: formData.get("username") as string,
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
    email: (formData.get("email") as string) || "",
    continent: (formData.get("continent") as string) || undefined,
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { username, password, email, continent } = parsed.data;

  // Check username uniqueness
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return { error: "Username already taken" };
  }

  // Check email uniqueness if provided
  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return { error: "Email already in use" };
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      username,
      passwordHash,
      email: email || null,
      continent: continent as "AFRICA" | "ASIA" | "EUROPE" | "NORTH_AMERICA" | "SOUTH_AMERICA" | "OCEANIA" | undefined,
    },
  });

  // Auto sign in after signup
  await signIn("credentials", {
    username,
    password,
    redirect: false,
  });

  redirect("/dashboard");
}

export async function login(_prevState: unknown, formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  const ip = await getClientIp();
  const { success } = rateLimit(`login:${ip}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
  if (!success) {
    return { error: "Too many login attempts. Please try again later." };
  }

  try {
    await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
  } catch {
    return { error: "Invalid username or password" };
  }

  redirect("/dashboard");
}

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  const raw = {
    continent: (formData.get("continent") as string) || undefined,
    coachPricePerHour: formData.get("coachPricePerHour")
      ? Number(formData.get("coachPricePerHour"))
      : undefined,
    gameReviewPrice: formData.get("gameReviewPrice")
      ? Number(formData.get("gameReviewPrice"))
      : undefined,
    communicationPreference:
      (formData.get("communicationPreference") as string) || "CHAT_ONLY",
    bio: (formData.get("bio") as string) || undefined,
    coachingEnabled: formData.get("coachingEnabled") === "true",
  };

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      continent: raw.continent as "AFRICA" | "ASIA" | "EUROPE" | "NORTH_AMERICA" | "SOUTH_AMERICA" | "OCEANIA" | undefined,
      coachPricePerHour: raw.coachPricePerHour
        ? Math.round(raw.coachPricePerHour * 100)
        : null,
      gameReviewPrice: raw.gameReviewPrice
        ? Math.round(raw.gameReviewPrice * 100)
        : null,
      communicationPreference: raw.communicationPreference as "CHAT_ONLY" | "CHAT_AND_CALL",
      bio: raw.bio || null,
      coachingEnabled: raw.coachingEnabled,
      lastActiveAt: new Date(),
      activityStatus: "ACTIVE",
    },
  });

  redirect("/profile/" + session.user.username);
}

export async function submitChessComUsername(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  // Check current verification status - only allow if NONE or REJECTED
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { verificationStatus: true },
  });
  if (!currentUser) {
    return { error: "User not found" };
  }
  if (currentUser.verificationStatus === "PENDING") {
    return { error: "You already have a pending verification request" };
  }
  if (currentUser.verificationStatus === "VERIFIED") {
    return { error: "Your account is already verified" };
  }

  const chessComUsername = formData.get("chessComUsername") as string;
  if (!chessComUsername) {
    return { error: "Chess.com username is required" };
  }

  // Validate that the chess.com username exists
  const exists = await chessComUsernameExists(chessComUsername);
  if (!exists) {
    return { error: "This chess.com username was not found. Please check the spelling." };
  }

  // Check if already taken
  const existing = await prisma.user.findUnique({
    where: { chessComUsername },
  });
  if (existing && existing.id !== session.user.id) {
    return { error: "This chess.com username is already linked to another account" };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      chessComUsername,
      verificationStatus: "PENDING",
    },
  });

  return { success: true };
}
