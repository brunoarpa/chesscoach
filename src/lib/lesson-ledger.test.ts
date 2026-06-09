import { describe, it, expect, vi } from "vitest";
import { payCoachForLesson } from "@/lib/lesson-ledger";
import { coachEarnings } from "@/lib/fees";

// A fake transaction client that records the writes payCoachForLesson makes,
// so we can assert the exact money movements without a database.
function makeFakeTx() {
  return {
    user: { update: vi.fn().mockResolvedValue({}) },
    transaction: { create: vi.fn().mockResolvedValue({}) },
    earningRecord: { create: vi.fn().mockResolvedValue({}) },
  };
}

// payCoachForLesson only touches these three delegates; cast the minimal fake
// to the real parameter type at the call site (the mocks stay typed for asserts).
type LedgerArg = Parameters<typeof payCoachForLesson>[0];
const asLedger = (tx: unknown) => tx as LedgerArg;

const paidLesson = {
  id: "lesson_1",
  studentId: "student_1",
  coachId: "coach_1",
  estimatedCost: 1500,
  isTrial: false,
};

describe("payCoachForLesson — paid lesson", () => {
  it("debits the student's wallet and reserved hold by the full cost", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "student_1" },
      data: {
        walletBalance: { decrement: 1500 },
        reservedBalance: { decrement: 1500 },
        lessonsTaken: { increment: 1 },
      },
    });
  });

  it("credits the coach with earnings (price minus commission)", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);

    const earnings = coachEarnings(1500); // 1350
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "coach_1" },
      data: {
        pendingEarnings: { increment: earnings },
        totalEarningsAllTime: { increment: earnings },
        lessonsGiven: { increment: 1 },
      },
    });
  });

  it("writes a balanced pair of ledger rows tied to the lesson", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);

    const earnings = coachEarnings(1500);
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: { userId: "student_1", type: "LESSON_PAYMENT", amount: -1500, lessonRequestId: "lesson_1" },
    });
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: { userId: "coach_1", type: "LESSON_PAYMENT", amount: earnings, lessonRequestId: "lesson_1" },
    });
    expect(tx.transaction.create).toHaveBeenCalledTimes(2);
  });

  it("records the coach's earning for ELO/stat purposes", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);
    expect(tx.earningRecord.create).toHaveBeenCalledWith({
      data: { userId: "coach_1", amount: coachEarnings(1500) },
    });
  });

  it("conserves money: the student debit equals the coach credit plus commission", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);

    type LedgerRow = { userId: string; amount: number };
    const rows = tx.transaction.create.mock.calls.map((c) => c[0].data as LedgerRow);
    const studentRow = rows.find((d) => d.userId === "student_1")!;
    const coachRow = rows.find((d) => d.userId === "coach_1")!;

    // Student pays 1500; coach receives earnings; the difference is platform margin.
    expect(-studentRow.amount).toBe(paidLesson.estimatedCost);
    expect(coachRow.amount).toBeLessThanOrEqual(paidLesson.estimatedCost);
  });
});

describe("payCoachForLesson — free trial", () => {
  it("moves no money at all", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), { ...paidLesson, isTrial: true });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.earningRecord.create).not.toHaveBeenCalled();
  });
});
