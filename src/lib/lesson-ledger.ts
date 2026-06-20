import type { Prisma } from "@/generated/prisma/client";

// Minimal client shape so this works with both the base client and an
// interactive transaction client. Type-only import keeps this module free of
// the runtime DB client, so it (and its tests) never open a connection.
type LedgerClient = Pick<Prisma.TransactionClient, "user" | "transaction" | "earningRecord">;

type LedgerLesson = {
  id: string;
  studentId: string;
  coachId: string;
  estimatedCost: number;
  isTrial: boolean;
};

/**
 * Where-fragment matching a free trial that was actually carried out: both
 * parties joined the lesson room. A student no-show also ends COMPLETED (the
 * coach is credited and the trial forfeited), but it must not count as a
 * delivered trial. Single source of truth for the paid-booking gate in
 * createLessonRequest and the UI that mirrors it (profile, coach dashboard).
 */
export const carriedOutTrialWhere = {
  status: "COMPLETED",
  isTrial: true,
  coachJoinedAt: { not: null },
  studentJoinedAt: { not: null },
} as const;

/**
 * Settle a completed lesson's payment: charge the student and credit the coach
 * the full (gross) price, writing both ledger entries and the coach's earning
 * record. The platform's commission is not taken here - the wallet shows gross
 * and the cut is realised at withdrawal (see payoutFee in lib/fees).
 *
 * This is the single canonical implementation of "money moves when a lesson
 * completes" - every completion path (auto-complete, no-show charge,
 * confirmation timeout) calls it so the wallet invariants can't drift between
 * copies. The caller still owns the lesson status transition and any
 * stat/ELO recomputation.
 *
 * Free trials never move money, but (for now - growth phase, revisit once the
 * user base is bigger) they DO count as real lessons: both parties' lesson
 * stats increment and the coach gets a $0 EarningRecord, which refreshes the
 * ELO earning-recency bonus without inflating lifetime earnings.
 *
 * Must be called inside a transaction so the student debit, coach credit, and
 * ledger writes commit atomically.
 */
export async function payCoachForLesson(
  tx: LedgerClient,
  lesson: LedgerLesson,
): Promise<void> {
  if (lesson.isTrial) {
    await tx.user.update({
      where: { id: lesson.studentId },
      data: { lessonsTaken: { increment: 1 } },
    });
    await tx.user.update({
      where: { id: lesson.coachId },
      data: { lessonsGiven: { increment: 1 } },
    });
    await tx.earningRecord.create({
      data: { userId: lesson.coachId, amount: 0 },
    });
    return;
  }

  // Wallet shows gross: the coach is credited the full price the student paid.
  // The platform's commission is taken later, at withdrawal - not here.
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
      pendingEarnings: { increment: lesson.estimatedCost },
      totalEarningsAllTime: { increment: lesson.estimatedCost },
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
      amount: lesson.estimatedCost,
      lessonRequestId: lesson.id,
    },
  });
  await tx.earningRecord.create({
    data: { userId: lesson.coachId, amount: lesson.estimatedCost },
  });
}
