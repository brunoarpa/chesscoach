import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    // TODO: Send email with reset link: /reset-password/confirm?token=${token}
    // For now, log it in development
    if (process.env.NODE_ENV === "development") {
      console.log(`Password reset token for ${email}: ${token}`);
      console.log(`Reset link: ${process.env.NEXT_PUBLIC_APP_URL}/reset-password/confirm?token=${token}`);
    }
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({ success: true });
}
