import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { VerificationTokenType } from "@/generated/prisma/enums";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createToken(
  userId: string,
  type: VerificationTokenType,
): Promise<string> {
  // Invalidate any unused tokens of the same type for this user.
  await prisma.verificationToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = crypto.randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      userId,
      type,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return raw;
}

export async function consumeToken(
  rawToken: string,
  type: VerificationTokenType,
): Promise<{ userId: string } | { error: string }> {
  if (!rawToken) return { error: "Invalid token." };
  const tokenHash = hash(rawToken);
  const entry = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!entry || entry.type !== type) return { error: "Invalid token." };
  if (entry.usedAt) return { error: "This link has already been used." };
  if (entry.expiresAt < new Date()) return { error: "This link has expired." };

  // Atomically claim the token: guard on usedAt:null so two requests racing on
  // the same link can't both consume it (the second matches 0 rows).
  const claimed = await prisma.verificationToken.updateMany({
    where: { id: entry.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { error: "This link has already been used." };
  return { userId: entry.userId };
}
