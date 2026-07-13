"use server";

import { put, del } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { fetchChessComAvatar } from "@/lib/chess-com";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB - keeps us under the serverless body limit
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type Result = { success: true; url: string } | { error: string };

/**
 * Upload a profile photo to Vercel Blob and lock it in with customAvatar so the
 * chess.com sync never overwrites it. Replaces any previously uploaded photo.
 */
export async function uploadAvatar(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const { success: rlSuccess } = await rateLimit(`upload-avatar:${session.user.id}`, {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlSuccess) return { error: "Too many uploads. Try again in an hour." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  if (!ALLOWED_TYPES.has(file.type)) return { error: "Use a JPG, PNG, WebP, or GIF image." };
  if (file.size > MAX_BYTES) return { error: "Image must be under 4MB." };

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];

  let url: string;
  try {
    // The token is auto-read from BLOB_READ_WRITE_TOKEN when a Blob store is
    // linked to the project on Vercel.
    const blob = await put(`avatars/${session.user.id}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    url = blob.url;
  } catch (e) {
    console.error("avatar upload failed", e);
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return { error: "Photo uploads aren't enabled yet (Blob store not linked). Redeploy after connecting it." };
    }
    return { error: "Upload failed. Please try again." };
  }

  // Best-effort cleanup of the previous uploaded photo so the store doesn't grow
  // unbounded. Never block the update on it.
  const previous = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true, customAvatar: true },
  });
  if (previous?.customAvatar && previous.image) {
    del(previous.image).catch(() => {});
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: url, customAvatar: true },
  });

  revalidatePath("/profile/edit");
  if (session.user.username) revalidatePath(`/profile/${session.user.username}`);
  revalidatePath("/search");
  return { success: true, url };
}

/**
 * Pull the current chess.com avatar on demand (verified coaches only). Lets a
 * user refresh their photo immediately instead of waiting for the daily cron.
 * Clears customAvatar since the picture is now chess.com-sourced again.
 */
export async function syncChessComAvatar(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const { success: rlSuccess } = await rateLimit(`sync-avatar:${session.user.id}`, {
    maxAttempts: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlSuccess) return { error: "Too many attempts. Try again in an hour." };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { chessComUsername: true, verificationStatus: true },
  });
  if (!user?.chessComUsername || user.verificationStatus !== "VERIFIED") {
    return { error: "Verify your chess.com account first." };
  }

  const avatar = await fetchChessComAvatar(user.chessComUsername);
  if (!avatar) {
    return { error: "No avatar found on your chess.com account. Set one there first." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: avatar, customAvatar: false },
  });

  revalidatePath("/profile/edit");
  if (session.user.username) revalidatePath(`/profile/${session.user.username}`);
  revalidatePath("/search");
  return { success: true, url: avatar };
}

/**
 * Remove an uploaded photo. Clears customAvatar so the chess.com avatar sync can
 * repopulate the picture on the next run (for verified coaches).
 */
export async function removeAvatar(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true, customAvatar: true },
  });
  if (!user?.customAvatar) return { error: "No uploaded photo to remove." };

  if (user.image) del(user.image).catch(() => {});

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: null, customAvatar: false },
  });

  revalidatePath("/profile/edit");
  if (session.user.username) revalidatePath(`/profile/${session.user.username}`);
  revalidatePath("/search");
  return { success: true, url: "" };
}
