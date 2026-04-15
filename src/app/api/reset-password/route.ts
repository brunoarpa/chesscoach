import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = await rateLimit(`reset:${ip}`, { maxAttempts: 3, windowMs: 15 * 60 * 1000 });
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { username, chessComUsername, email, message } = await request.json();

  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  if (email.length > 254) {
    return NextResponse.json({ error: "Email is too long" }, { status: 400 });
  }

  if (username.length > 50 || (chessComUsername && chessComUsername.length > 50)) {
    return NextResponse.json({ error: "Input too long" }, { status: 400 });
  }

  if (message && message.length > 500) {
    return NextResponse.json({ error: "Message is too long (max 500 characters)" }, { status: 400 });
  }

  // Check that the username actually exists
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "No account found with that username" }, { status: 404 });
  }

  // Check for existing unresolved request for this username
  const existing = await prisma.recoveryRequest.findFirst({
    where: { username, resolved: false },
  });

  if (existing) {
    return NextResponse.json({ error: "You already have a pending recovery request. Please wait for an admin to review it." }, { status: 409 });
  }

  await prisma.recoveryRequest.create({
    data: {
      username,
      chessComUsername: chessComUsername?.slice(0, 50) || null,
      email: email.toLowerCase().trim(),
      message: message?.slice(0, 500) || null,
    },
  });

  return NextResponse.json({ success: true });
}
