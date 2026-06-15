import { describe, it, expect, vi } from "vitest";
import { payCoachForLesson } from "@/lib/lesson-ledger";

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

  it("credits the coach the full gross price (commission is taken at withdrawal)", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "coach_1" },
      data: {
        pendingEarnings: { increment: 1500 },
        totalEarningsAllTime: { increment: 1500 },
        lessonsGiven: { increment: 1 },
      },
    });
  });

  it("writes a balanced pair of ledger rows tied to the lesson", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);

    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: { userId: "student_1", type: "LESSON_PAYMENT", amount: -1500, lessonRequestId: "lesson_1" },
    });
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: { userId: "coach_1", type: "LESSON_PAYMENT", amount: 1500, lessonRequestId: "lesson_1" },
    });
    expect(tx.transaction.create).toHaveBeenCalledTimes(2);
  });

  it("records the coach's gross earning for ELO/stat purposes", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);
    expect(tx.earningRecord.create).toHaveBeenCalledWith({
      data: { userId: "coach_1", amount: 1500 },
    });
  });

  it("conserves money: the gross debit to the student equals the gross credit to the coach", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), paidLesson);

    type LedgerRow = { userId: string; amount: number };
    const rows = tx.transaction.create.mock.calls.map((c) => c[0].data as LedgerRow);
    const studentRow = rows.find((d) => d.userId === "student_1")!;
    const coachRow = rows.find((d) => d.userId === "coach_1")!;

    // Wallet shows gross: student pays 1500, coach is credited the same 1500.
    // The platform's commission is realised later, at withdrawal.
    expect(-studentRow.amount).toBe(paidLesson.estimatedCost);
    expect(coachRow.amount).toBe(paidLesson.estimatedCost);
  });
});

describe("payCoachForLesson — free trial", () => {
  it("moves no money: no balance changes, no ledger rows", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), { ...paidLesson, isTrial: true });

    expect(tx.transaction.create).not.toHaveBeenCalled();
    for (const call of tx.user.update.mock.calls) {
      const data = call[0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty("walletBalance");
      expect(data).not.toHaveProperty("reservedBalance");
      expect(data).not.toHaveProperty("pendingEarnings");
      expect(data).not.toHaveProperty("totalEarningsAllTime");
    }
  });

  it("still counts as a lesson for both parties' stats", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), { ...paidLesson, isTrial: true });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "student_1" },
      data: { lessonsTaken: { increment: 1 } },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "coach_1" },
      data: { lessonsGiven: { increment: 1 } },
    });
  });

  it("writes a $0 earning record so the coach's ELO recency bonus refreshes", async () => {
    const tx = makeFakeTx();
    await payCoachForLesson(asLedger(tx), { ...paidLesson, isTrial: true });

    expect(tx.earningRecord.create).toHaveBeenCalledWith({
      data: { userId: "coach_1", amount: 0 },
    });
  });
});
