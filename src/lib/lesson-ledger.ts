import { prisma } from "@/lib/prisma";
import { coachEarnings } from "@/lib/fees";

// Minimal client shape so this works with both the base client and an
// interactive transaction client (which lacks $transaction et al.).
type LedgerClient = Pick<typeof prisma, "user" | "transaction" | "earningRecord">;

type LedgerLesson = {
  id: string;
  studentId: string;
  coachId: string;
  estimatedCost: number;
  isTrial: boolean;
};

/**
 * Settle a completed lesson's payment: charge the student and pay the coach
 * their share, writing both ledger entries and the coach's earning record.
 *
 * This is the single canonical implementation of "money moves when a lesson
 * completes" — every completion path (auto-complete, no-show charge,
 * confirmation timeout) calls it so the wallet invariants can't drift between
 * copies. The caller still owns the lesson status transition and any
 * stat/ELO recomputation.
 *
 * No-op for free trials, which never move money. Must be called inside a
 * transaction so the student debit, coach credit, and ledger writes commit
 * atomically.
 */
export async function payCoachForLesson(
  tx: LedgerClient,
  lesson: LedgerLesson,
): Promise<void> {
  if (lesson.isTrial) return;

  const earnings = coachEarnings(lesson.estimatedCost);

  // Money leaves the student's wallet AND releases the matching hold.
  await tx.user.update({
    where: { id: lesson.studentId },
    data: {
      walletBalance: { decrement: lesson.estimatedCost },
      reservedBalance: { decrement: lesson.estimatedCost },
      lessonsTaken: { increment: 1 },
    },
  });
  await tx.user.update({
    where: { id: lesson.coachId },
    data: {
      pendingEarnings: { increment: earnings },
      totalEarningsAllTime: { increment: earnings },
      lessonsGiven: { increment: 1 },
    },
  });
  await tx.transaction.create({
    data: {
      userId: lesson.studentId,
      type: "LESSON_PAYMENT",
      amount: -lesson.estimatedCost,
      lessonRequestId: lesson.id,
    },
  });
  await tx.transaction.create({
    data: {
      userId: lesson.coachId,
      type: "LESSON_PAYMENT",
      amount: earnings,
      lessonRequestId: lesson.id,
    },
  });
  await tx.earningRecord.create({
    data: { userId: lesson.coachId, amount: earnings },
  });
}
