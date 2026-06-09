"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { fetchChessComRating, fetchChessComProfile } from "@/lib/chess-com";
import { coachEarnings } from "@/lib/fees";

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

  // Atomically claim the lesson before moving any money so two admins resolving
  // the same dispute concurrently can't double-process it. Each branch guards on
  // the status it read; if a concurrent resolution already changed it, the
  // updateMany matches 0 rows and we abort.
  const startStatus = lesson.status;
  try {
    if (resolution === "refund") {
      if (lesson.status === "NO_SHOW") {
        // COACH_NO_SHOW: student was already auto-refunded. Just cancel and audit.
        await prisma.$transaction(async (tx) => {
          const claim = await tx.lessonRequest.updateMany({
            where: { id: lessonId, status: startStatus },
            data: { status: "CANCELLED" },
          });
          if (claim.count === 0) throw new Error("ALREADY_RESOLVED");
          await tx.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } });
          await tx.auditLog.create({
            data: {
              adminId,
              action: "RESOLVE_DISPUTE",
              targetId: lessonId,
              details: `No-show acknowledged: refund confirmed for student "${lesson.student.username}". Coach: "${lesson.coach.username}".`,
            },
          });
        });
      } else if (lesson.status === "COMPLETED") {
        // STUDENT_NO_SHOW: lesson was auto-completed and coach was paid. Reverse the payment.
        await prisma.$transaction(async (tx) => {
          const claim = await tx.lessonRequest.updateMany({
            where: { id: lessonId, status: startStatus },
            data: { status: "CANCELLED" },
          });
          if (claim.count === 0) throw new Error("ALREADY_RESOLVED");
          if (!lesson.isTrial) {
            // Restore student wallet
            await tx.user.update({
              where: { id: lesson.studentId },
              data: { walletBalance: { increment: lesson.estimatedCost } },
            });
            // Claw back coach earnings. pendingEarnings may go negative if the
            // coach already withdrew the money — that's a deficit they'll
            // pay back out of future earnings (Stripe transfers can't be
            // reversed once they've landed in the coach's Connect balance).
            // The withdraw form's MIN_PAYOUT_CENTS check naturally blocks
            // withdrawals while the balance is below the minimum.
            await tx.user.update({
              where: { id: lesson.coachId },
              data: {
                pendingEarnings: { decrement: coachEarnings(lesson.estimatedCost) },
                totalEarningsAllTime: { decrement: coachEarnings(lesson.estimatedCost) },
              },
            });
            await tx.transaction.create({
              data: {
                userId: lesson.studentId,
                type: "LESSON_REFUND",
                amount: lesson.estimatedCost,
                lessonRequestId: lessonId,
              },
            });
            await tx.transaction.create({
              data: {
                userId: lesson.coachId,
                type: "LESSON_REFUND",
                amount: -coachEarnings(lesson.estimatedCost),
                lessonRequestId: lessonId,
              },
            });
          }
          await tx.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } });
          await tx.auditLog.create({
            data: {
              adminId,
              action: "RESOLVE_DISPUTE",
              targetId: lessonId,
              details: `No-show overridden: refund issued to student "${lesson.student.username}". Coach: "${lesson.coach.username}".`,
            },
          });
        });
      } else {
        // DISPUTED: release reserved funds, set lesson to CANCELLED
        await prisma.$transaction(async (tx) => {
          const claim = await tx.lessonRequest.updateMany({
            where: { id: lessonId, status: startStatus },
            data: { status: "CANCELLED" },
          });
          if (claim.count === 0) throw new Error("ALREADY_RESOLVED");
          if (!lesson.isTrial) {
            await tx.user.update({
              where: { id: lesson.studentId },
              data: { reservedBalance: { decrement: lesson.estimatedCost } },
            });
          }
          await tx.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } });
          await tx.auditLog.create({
            data: {
              adminId,
              action: "RESOLVE_DISPUTE",
              targetId: lessonId,
              details: `Dispute resolved: refund to student "${lesson.student.username}". Coach: "${lesson.coach.username}".`,
            },
          });
        });
      }
    } else {
      if (lesson.status === "COMPLETED") {
        // STUDENT_NO_SHOW: lesson already auto-completed and coach already paid. Just audit.
        // Guard on hasActiveDispute so a concurrent resolution doesn't double-audit.
        await prisma.$transaction(async (tx) => {
          const claim = await tx.user.updateMany({
            where: { id: lesson.studentId, hasActiveDispute: true },
            data: { hasActiveDispute: false },
          });
          if (claim.count === 0) throw new Error("ALREADY_RESOLVED");
          await tx.auditLog.create({
            data: {
              adminId,
              action: "RESOLVE_DISPUTE",
              targetId: lessonId,
              details: `No-show acknowledged: coach "${lesson.coach.username}" payment confirmed. Student: "${lesson.student.username}".`,
            },
          });
        });
      } else if (lesson.status === "NO_SHOW") {
        // COACH_NO_SHOW override: admin decides to pay coach despite no-show.
        // Student's reservedBalance was already freed (no-show refund); take from walletBalance instead.
        await prisma.$transaction(async (tx) => {
          const claim = await tx.lessonRequest.updateMany({
            where: { id: lessonId, status: startStatus },
            data: { status: "COMPLETED", completedAt: new Date(), studentConfirmed: true, coachConfirmed: true },
          });
          if (claim.count === 0) throw new Error("ALREADY_RESOLVED");
          if (!lesson.isTrial) {
            await tx.user.update({
              where: { id: lesson.studentId },
              data: { walletBalance: { decrement: lesson.estimatedCost } },
            });
            await tx.user.update({
              where: { id: lesson.coachId },
              data: {
                pendingEarnings: { increment: coachEarnings(lesson.estimatedCost) },
                totalEarningsAllTime: { increment: coachEarnings(lesson.estimatedCost) },
                lessonsGiven: { increment: 1 },
                // Reverse the ELO penalty applied during no-show detection
                coachRatingPenalty: { decrement: 50 },
              },
            });
            await tx.transaction.create({
              data: {
                userId: lesson.studentId,
                type: "LESSON_PAYMENT",
                amount: -lesson.estimatedCost,
                lessonRequestId: lessonId,
              },
            });
            await tx.transaction.create({
              data: {
                userId: lesson.coachId,
                type: "LESSON_PAYMENT",
                amount: coachEarnings(lesson.estimatedCost),
                lessonRequestId: lessonId,
              },
            });
            await tx.earningRecord.create({
              data: { userId: lesson.coachId, amount: coachEarnings(lesson.estimatedCost) },
            });
          }
          await tx.user.update({ where: { id: lesson.studentId }, data: { hasActiveDispute: false } });
          await tx.auditLog.create({
            data: {
              adminId,
              action: "RESOLVE_DISPUTE",
              targetId: lessonId,
              details: `No-show overridden: paid coach "${lesson.coach.username}" despite no-show flag. Student: "${lesson.student.username}".`,
            },
          });
        });
      } else {
        // DISPUTED: pay coach — complete the payment as normal
        await prisma.$transaction(async (tx) => {
          const claim = await tx.lessonRequest.updateMany({
            where: { id: lessonId, status: startStatus },
            data: {
              status: "COMPLETED",
              completedAt: new Date(),
              studentConfirmed: true,
              coachConfirmed: true,
            },
          });
          if (claim.count === 0) throw new Error("ALREADY_RESOLVED");
          await tx.user.update({
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
          });
          await tx.user.update({
            where: { id: lesson.coachId },
            data: {
              ...(lesson.isTrial
                ? { lessonsGiven: { increment: 1 } }
                : {
                    pendingEarnings: { increment: coachEarnings(lesson.estimatedCost) },
                    totalEarningsAllTime: { increment: coachEarnings(lesson.estimatedCost) },
                    lessonsGiven: { increment: 1 },
                  }),
            },
          });
          if (!lesson.isTrial) {
            await tx.transaction.create({
              data: {
                userId: lesson.studentId,
                type: "LESSON_PAYMENT",
                amount: -lesson.estimatedCost,
                lessonRequestId: lessonId,
              },
            });
            await tx.transaction.create({
              data: {
                userId: lesson.coachId,
                type: "LESSON_PAYMENT",
                amount: coachEarnings(lesson.estimatedCost),
                lessonRequestId: lessonId,
              },
            });
            await tx.earningRecord.create({
              data: {
                userId: lesson.coachId,
                amount: coachEarnings(lesson.estimatedCost),
              },
            });
          }
          await tx.auditLog.create({
            data: {
              adminId,
              action: "RESOLVE_DISPUTE",
              targetId: lessonId,
              details: `Dispute resolved: paid coach "${lesson.coach.username}". Student: "${lesson.student.username}".`,
            },
          });
        });
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_RESOLVED") {
      throw new Error("This dispute has already been resolved.");
    }
    throw err;
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
