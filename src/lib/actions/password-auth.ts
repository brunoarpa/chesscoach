"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { createToken, consumeToken } from "@/lib/tokens";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";

function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 128) return "Password is too long.";
  return null;
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function signUpWithPassword(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  const password = formData.get("password");
  if (!email) return { error: "Please enter a valid email." };
  if (typeof password !== "string") return { error: "Password is required." };
  const pwErr = validatePassword(password);
  if (pwErr) return { error: pwErr };

  const { success: rlOk } = await rateLimit(`signup:${email}`, {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlOk) return { error: "Too many attempts. Try again later." };

  // Never let signup touch an existing account. Setting a password on an
  // account that's already email-verified (e.g. a Google sign-in) would hand
  // login to whoever submitted this form — an account-takeover vector. An
  // existing user who wants to add or change a password must prove they own
  // the inbox via "Forgot password", which sets the password through a token.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      error:
        "An account with this email already exists. Try signing in, or use “Forgot password” to set a new password.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = await createToken(created.id, "EMAIL_VERIFICATION");
  try {
    await sendVerificationEmail(email, token);
  } catch (err) {
    console.error("[signUpWithPassword] sendVerificationEmail failed", err);
    return { error: "We couldn't send the verification email. Please try again in a moment." };
  }
  return { success: true };
}

export async function verifyEmail(token: string) {
  const result = await consumeToken(token, "EMAIL_VERIFICATION");
  if ("error" in result) return { error: result.error };
  await prisma.user.update({
    where: { id: result.userId },
    data: { emailVerified: new Date() },
  });
  return { success: true };
}

export async function resendVerificationEmail(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "Please enter a valid email." };

  const { success: rlOk } = await rateLimit(`resend-verify:${email}`, {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlOk) return { error: "Too many attempts. Try again later." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified) {
    const token = await createToken(user.id, "EMAIL_VERIFICATION");
    try {
      await sendVerificationEmail(email, token);
    } catch (err) {
      console.error("[resendVerificationEmail] failed", err);
      return { error: "We couldn't send the email. Please try again in a moment." };
    }
  }
  return { success: true };
}

export async function requestPasswordReset(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "Please enter a valid email." };

  const { success: rlOk } = await rateLimit(`reset-req:${email}`, {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlOk) return { error: "Too many attempts. Try again later." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createToken(user.id, "PASSWORD_RESET");
    try {
      await sendPasswordResetEmail(email, token);
    } catch (err) {
      console.error("[requestPasswordReset] failed", err);
      // Still succeed below to avoid leaking which emails exist.
    }
  }
  // Always succeed so we don't leak which emails are registered.
  return { success: true };
}

export async function resetPassword(formData: FormData) {
  const token = formData.get("token");
  const password = formData.get("password");
  if (typeof token !== "string" || !token) return { error: "Invalid link." };
  if (typeof password !== "string") return { error: "Password is required." };
  const pwErr = validatePassword(password);
  if (pwErr) return { error: pwErr };

  const result = await consumeToken(token, "PASSWORD_RESET");
  if ("error" in result) return { error: result.error };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: result.userId },
    data: {
      passwordHash,
      // If they could reset via email, they own the inbox — mark verified too.
      emailVerified: new Date(),
    },
  });
  return { success: true };
}
