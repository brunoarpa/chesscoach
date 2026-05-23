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

export async function resolveRecoveryRequest(requestId: string) {
  const adminId = await requireAdmin();

  await prisma.recoveryRequest.update({
    where: { id: requestId },
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
  if (!["DISPUTED", "COMPLETED", "NO_SHOW"].includes(lesson.status)) {
    throw new Error("Lesson is not in a resolvable state");
  }

  if (resolution === "refund") {
    if (lesson.status === "NO_SHOW") {
      // COACH_NO_SHOW: student was already auto-refunded. Just cancel and audit.
      await prisma.$transaction([
        prisma.lessonRequest.update({ where: { id: lessonId }, data: { status: "CANCELLED" } }),
        prisma.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } }),
        prisma.auditLog.create({
          data: {
            adminId,
            action: "RESOLVE_DISPUTE",
            targetId: lessonId,
            details: `No-show acknowledged: refund confirmed for student "${lesson.student.username}". Coach: "${lesson.coach.username}".`,
          },
        }),
      ]);
    } else if (lesson.status === "COMPLETED") {
      // STUDENT_NO_SHOW: lesson was auto-completed and coach was paid. Reverse the payment.
      await prisma.$transaction([
        prisma.lessonRequest.update({ where: { id: lessonId }, data: { status: "CANCELLED" } }),
        ...(lesson.isTrial
          ? []
          : [
              // Restore student wallet
              prisma.user.update({
                where: { id: lesson.studentId },
                data: { walletBalance: { increment: lesson.estimatedCost } },
              }),
              // Claw back coach earnings. pendingEarnings may go negative if the
              // coach already withdrew the money — that's a deficit they'll
              // pay back out of future earnings (Stripe transfers can't be
              // reversed once they've landed in the coach's Connect balance).
              // The withdraw form's MIN_PAYOUT_CENTS check naturally blocks
              // withdrawals while the balance is below the minimum.
              prisma.user.update({
                where: { id: lesson.coachId },
                data: {
                  pendingEarnings: { decrement: lesson.estimatedCost },
                  totalEarningsAllTime: { decrement: lesson.estimatedCost },
                },
              }),
              prisma.transaction.create({
                data: {
                  userId: lesson.studentId,
                  type: "LESSON_REFUND",
                  amount: lesson.estimatedCost,
                  lessonRequestId: lessonId,
                },
              }),
              prisma.transaction.create({
                data: {
                  userId: lesson.coachId,
                  type: "LESSON_REFUND",
                  amount: -lesson.estimatedCost,
                  lessonRequestId: lessonId,
                },
              }),
            ]),
        prisma.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } }),
        prisma.auditLog.create({
          data: {
            adminId,
            action: "RESOLVE_DISPUTE",
            targetId: lessonId,
            details: `No-show overridden: refund issued to student "${lesson.student.username}". Coach: "${lesson.coach.username}".`,
          },
        }),
      ]);
    } else {
      // DISPUTED: release reserved funds, set lesson to CANCELLED
      await prisma.$transaction([
        prisma.lessonRequest.update({ where: { id: lessonId }, data: { status: "CANCELLED" } }),
        ...(lesson.isTrial
          ? []
          : [
              prisma.user.update({
                where: { id: lesson.studentId },
                data: { reservedBalance: { decrement: lesson.estimatedCost } },
              }),
            ]),
        prisma.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } }),
        prisma.auditLog.create({
          data: {
            adminId,
            action: "RESOLVE_DISPUTE",
            targetId: lessonId,
            details: `Dispute resolved: refund to student "${lesson.student.username}". Coach: "${lesson.coach.username}".`,
          },
        }),
      ]);
    }
  } else {
    if (lesson.status === "COMPLETED") {
      // STUDENT_NO_SHOW: lesson already auto-completed and coach already paid. Just audit.
      await prisma.$transaction([
        prisma.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } }),
        prisma.auditLog.create({
          data: {
            adminId,
            action: "RESOLVE_DISPUTE",
            targetId: lessonId,
            details: `No-show acknowledged: coach "${lesson.coach.username}" payment confirmed. Student: "${lesson.student.username}".`,
          },
        }),
      ]);
    } else if (lesson.status === "NO_SHOW") {
      // COACH_NO_SHOW override: admin decides to pay coach despite no-show.
      // Student's reservedBalance was already freed (no-show refund); take from walletBalance instead.
      await prisma.$transaction([
        prisma.lessonRequest.update({
          where: { id: lessonId },
          data: { status: "COMPLETED", completedAt: new Date(), studentConfirmed: true, coachConfirmed: true },
        }),
        ...(lesson.isTrial
          ? []
          : [
              prisma.user.update({
                where: { id: lesson.studentId },
                data: { walletBalance: { decrement: lesson.estimatedCost } },
              }),
              prisma.user.update({
                where: { id: lesson.coachId },
                data: {
                  pendingEarnings: { increment: lesson.estimatedCost },
                  totalEarningsAllTime: { increment: lesson.estimatedCost },
                  lessonsGiven: { increment: 1 },
                  // Reverse the ELO penalty applied during no-show detection
                  coachRatingPenalty: { decrement: 50 },
                },
              }),
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
                data: { userId: lesson.coachId, amount: lesson.estimatedCost },
              }),
            ]),
        prisma.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } }),
        prisma.auditLog.create({
          data: {
            adminId,
            action: "RESOLVE_DISPUTE",
            targetId: lessonId,
            details: `No-show overridden: paid coach "${lesson.coach.username}" despite no-show flag. Student: "${lesson.student.username}".`,
          },
        }),
      ]);
    } else {
      // DISPUTED: pay coach — complete the payment as normal
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
  }

  // Mark all relevant flags for this lesson as resolved
  await prisma.abuseFlag.updateMany({
    where: {
      relatedLessonId: lessonId,
      type: { in: ["LESSON_DISPUTE", "STUDENT_NO_SHOW", "COACH_NO_SHOW"] },
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
