"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { fetchChessComRating, fetchChessComProfile } from "@/lib/chess-com";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") throw new Error("Not authorized");
  return session.user.id;
}

export async function verifyUser(userId: string) {
  await requireAdmin();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { chessComUsername: true },
  });

  if (!user?.chessComUsername) throw new Error("No chess.com username");

  // Auto-fetch rating and profile from chess.com API
  const [rating, profile] = await Promise.all([
    fetchChessComRating(user.chessComUsername),
    fetchChessComProfile(user.chessComUsername),
  ]);

  await prisma.user.update({
    where: { id: userId },
    data: {
      verificationStatus: "VERIFIED",
      chessRating: rating,
      chessComAccountAge: profile?.joined ?? null,
    },
  });

  revalidatePath("/admin");
}

export async function rejectUser(userId: string) {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: {
      verificationStatus: "REJECTED",
      chessComUsername: null,
    },
  });

  revalidatePath("/admin");
}

export async function banUser(userId: string) {
  await requireAdmin();

  // Reset their wallet and earnings, effectively banning
  await prisma.user.update({
    where: { id: userId },
    data: {
      verificationStatus: "REJECTED",
      activityStatus: "INACTIVE",
    },
  });

  revalidatePath("/admin");
}

export async function setUserRole(userId: string, role: "USER" | "ADMIN") {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/admin");
}
