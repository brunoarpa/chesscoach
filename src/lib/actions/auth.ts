"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validations";
import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { chessComUsernameExists } from "@/lib/chess-com";

async function getClientIp() {
  const h = await headers();
  return getClientIpFromHeaders(h);
}

export async function signup(formData: FormData) {
  const ip = await getClientIp();
  const { success } = await rateLimit(`signup:${ip}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
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
      signupIp: ip,
    },
  });

  // Check for other accounts from same IP (created in last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sameIpAccounts = await prisma.user.findMany({
    where: {
      signupIp: ip,
      username: { not: username },
      createdAt: { gte: sevenDaysAgo },
    },
    select: { id: true, username: true },
  });

  if (sameIpAccounts.length > 0) {
    const newUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (newUser) {
      for (const otherAccount of sameIpAccounts) {
        await prisma.abuseFlag.create({
          data: {
            userId: newUser.id,
            type: "MULTI_ACCOUNT_SUSPECTED",
            severity: "MEDIUM",
            details: `Multiple accounts created from same IP (${ip}) within 7 days. Other account: ${otherAccount.username}`,
            relatedUserId: otherAccount.id,
          },
        });
      }
    }
  }

  // Auto sign in after signup
  await signIn("credentials", {
    username,
    password,
    redirect: false,
  });

  redirect("/how-it-works");
}

export async function login(_prevState: unknown, formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  const ip = await getClientIp();
  const { success } = await rateLimit(`login:${ip}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
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
    coachPricePer5Min: formData.get("coachPricePer5Min")
      ? Number(formData.get("coachPricePer5Min"))
      : undefined,
    communicationPreference:
      (formData.get("communicationPreference") as string) || "CHAT_ONLY",
    bio: (formData.get("bio") as string) || undefined,
    coachAvailability: (formData.get("coachAvailability") as string) || "AVAILABLE",
  };

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      continent: raw.continent as "AFRICA" | "ASIA" | "EUROPE" | "NORTH_AMERICA" | "SOUTH_AMERICA" | "OCEANIA" | undefined,
      coachPricePer5Min: raw.coachPricePer5Min
        ? Math.round(raw.coachPricePer5Min * 100)
        : null,
      communicationPreference: raw.communicationPreference as "CHAT_ONLY" | "CHAT_AND_CALL",
      bio: raw.bio || null,
      coachAvailability: raw.coachAvailability as "AVAILABLE" | "BUSY" | "UNAVAILABLE",
      lastActiveAt: new Date(),
      activityStatus: "ACTIVE",
    },
  });

  redirect("/profile/" + session.user.username);
}

export async function updateCoachAvailability(newStatus: "AVAILABLE" | "BUSY" | "UNAVAILABLE") {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

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
