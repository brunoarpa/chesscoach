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
  const adminId = await requireAdmin();

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

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: "VERIFIED",
        chessRating: rating,
        chessComAccountAge: profile?.joined ?? null,
      },
    }),
    prisma.auditLog.create({
      data: { adminId, action: "VERIFY_USER", targetId: userId },
    }),
  ]);

  revalidatePath("/admin");
}

export async function rejectUser(userId: string) {
  const adminId = await requireAdmin();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: "REJECTED",
        chessComUsername: null,
      },
    }),
    prisma.auditLog.create({
      data: { adminId, action: "REJECT_USER", targetId: userId },
    }),
  ]);

  revalidatePath("/admin");
}

export async function banUser(userId: string) {
  const adminId = await requireAdmin();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: "REJECTED",
        activityStatus: "INACTIVE",
      },
    }),
    prisma.auditLog.create({
      data: { adminId, action: "BAN_USER", targetId: userId },
    }),
  ]);

  revalidatePath("/admin");
}

export async function setUserRole(userId: string, role: "USER" | "ADMIN") {
  const adminId = await requireAdmin();

  if (role !== "USER" && role !== "ADMIN") throw new Error("Invalid role");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { role },
    }),
    prisma.auditLog.create({
      data: { adminId, action: "SET_ROLE", targetId: userId, details: `Role set to ${role}` },
    }),
  ]);

  revalidatePath("/admin");
}

export async function suspendUser(userId: string) {
  const adminId = await requireAdmin();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { isSuspended: true },
    }),
    prisma.auditLog.create({
      data: { adminId, action: "SUSPEND_USER", targetId: userId },
    }),
  ]);

  revalidatePath("/admin");
}

export async function unsuspendUser(userId: string) {
  const adminId = await requireAdmin();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { isSuspended: false },
    }),
    prisma.auditLog.create({
      data: { adminId, action: "UNSUSPEND_USER", targetId: userId },
    }),
  ]);

  revalidatePath("/admin");
}

export async function resolveAbuseFlag(flagId: string) {
  const adminId = await requireAdmin();

  await prisma.abuseFlag.update({
    where: { id: flagId },
    data: {
      resolved: true,
      resolvedBy: adminId,
      resolvedAt: new Date(),
    },
  });

  revalidatePath("/admin");
}

export async function resolveDispute(
  lessonId: string,
  resolution: "refund" | "pay_coach"
) {
  const adminId = await requireAdmin();

  const lesson = await prisma.lessonRequest.findUnique({
    where: { id: lessonId },
    include: {
      student: { select: { id: true, username: true } },
      coach: { select: { id: true, username: true } },
    },
  });

  if (!lesson) throw new Error("Lesson not found");
  if (lesson.status !== "DISPUTED") throw new Error("Lesson is not disputed");

  if (resolution === "refund") {
    // Refund: release reserved funds, set lesson to CANCELLED
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: lessonId },
        data: { status: "CANCELLED" },
      }),
      ...(lesson.isTrial
        ? []
        : [
            prisma.user.update({
              where: { id: lesson.studentId },
              data: { reservedBalance: { decrement: lesson.estimatedCost } },
            }),
          ]),
      prisma.user.update({
        where: { id: lesson.studentId },
        data: { hasActiveDispute: false },
      }),
      prisma.auditLog.create({
        data: {
          adminId,
          action: "RESOLVE_DISPUTE",
          targetId: lessonId,
          details: `Dispute resolved: refund to student "${lesson.student.username}". Coach: "${lesson.coach.username}".`,
        },
      }),
    ]);
  } else {
    // Pay coach: complete the payment as normal
    const txOps = [
      prisma.lessonRequest.update({
        where: { id: lessonId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          studentConfirmed: true,
          coachConfirmed: true,
        },
      }),
      prisma.user.update({
        where: { id: lesson.studentId },
        data: {
          hasActiveDispute: false,
          ...(lesson.isTrial
            ? { lessonsTaken: { increment: 1 } }
            : {
                walletBalance: { decrement: lesson.estimatedCost },
                reservedBalance: { decrement: lesson.estimatedCost },
                lessonsTaken: { increment: 1 },
              }),
        },
      }),
      prisma.user.update({
        where: { id: lesson.coachId },
        data: {
          ...(lesson.isTrial
            ? { lessonsGiven: { increment: 1 } }
            : {
                pendingEarnings: { increment: lesson.estimatedCost },
                totalEarningsAllTime: { increment: lesson.estimatedCost },
                lessonsGiven: { increment: 1 },
              }),
        },
      }),
      ...(lesson.isTrial
        ? []
        : [
            prisma.transaction.create({
              data: {
                userId: lesson.studentId,
                type: "LESSON_PAYMENT",
                amount: -lesson.estimatedCost,
                lessonRequestId: lessonId,
              },
            }),
            prisma.transaction.create({
              data: {
                userId: lesson.coachId,
                type: "LESSON_PAYMENT",
                amount: lesson.estimatedCost,
                lessonRequestId: lessonId,
              },
            }),
            prisma.earningRecord.create({
              data: {
                userId: lesson.coachId,
                amount: lesson.estimatedCost,
              },
            }),
          ]),
      prisma.auditLog.create({
        data: {
          adminId,
          action: "RESOLVE_DISPUTE",
          targetId: lessonId,
          details: `Dispute resolved: paid coach "${lesson.coach.username}". Student: "${lesson.student.username}".`,
        },
      }),
    ];
    await prisma.$transaction(txOps);
  }

  // Mark all LESSON_DISPUTE flags for this lesson as resolved
  await prisma.abuseFlag.updateMany({
    where: {
      relatedLessonId: lessonId,
      type: "LESSON_DISPUTE",
      resolved: false,
    },
    data: {
      resolved: true,
      resolvedBy: adminId,
      resolvedAt: new Date(),
    },
  });

  revalidatePath("/admin");
}
