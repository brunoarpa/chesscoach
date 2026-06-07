/**
 * One-off balance reconciliation script.
 *
 * Recomputes each user's wallet/earnings fields from authoritative sources and
 * reports (and optionally fixes) any drift. Written to clean up accounts left in
 * a bad state by the old no-show accounting bug (money created on student
 * no-shows) and the concurrent-cron double-decrement of reservedBalance.
 *
 *   npx tsx prisma/repair-balances.ts            # dry run — prints drift, writes nothing
 *   npx tsx prisma/repair-balances.ts --commit   # apply the corrections
 *
 * Sources of truth:
 *   reservedBalance      = Σ estimatedCost of the student's non-trial lessons that
 *                          are still live (PENDING / ACCEPTED / IN_PROGRESS / DISPUTED).
 *   walletBalance        = deposits + student lesson payments (negative) + student refunds.
 *   pendingEarnings      = coach lesson earnings − payouts − clawbacks.
 *   totalEarningsAllTime = coach lesson earnings − clawbacks.
 *
 * Lesson-linked transactions are de-duplicated by (lessonRequestId, type, sign)
 * so a lesson that was accidentally processed twice (and thus has duplicate
 * ledger rows) only counts once.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const COMMIT = process.argv.includes("--commit");

// Statuses where the student's funds are still held (not yet spent or released).
const LIVE_STATUSES = ["PENDING", "ACCEPTED", "IN_PROGRESS", "DISPUTED"] as const;

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      walletBalance: true,
      reservedBalance: true,
      pendingEarnings: true,
      totalEarningsAllTime: true,
    },
  });

  let drifted = 0;

  for (const user of users) {
    // --- reservedBalance: sum of live, non-trial lessons as student ---
    const liveLessons = await prisma.lessonRequest.findMany({
      where: {
        studentId: user.id,
        isTrial: false,
        status: { in: [...LIVE_STATUSES] },
      },
      select: { estimatedCost: true },
    });
    const reserved = liveLessons.reduce((sum, l) => sum + l.estimatedCost, 0);

    // --- wallet / earnings: rebuild from the de-duplicated ledger ---
    const txns = await prisma.transaction.findMany({
      where: { userId: user.id },
      select: { type: true, amount: true, lessonRequestId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Collapse duplicate lesson rows: one entry per (lesson, type, sign).
    const seen = new Set<string>();
    const deduped = txns.filter((t) => {
      if (t.type !== "LESSON_PAYMENT" && t.type !== "LESSON_REFUND") return true;
      if (!t.lessonRequestId) return true;
      const key = `${t.lessonRequestId}:${t.type}:${t.amount < 0 ? "-" : "+"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let deposits = 0;
    let studentSpend = 0; // negative LESSON_PAYMENT + positive LESSON_REFUND
    let coachEarn = 0; // positive LESSON_PAYMENT
    let clawback = 0; // negative LESSON_REFUND
    let payouts = 0; // negative PAYOUT

    for (const t of deduped) {
      if (t.type === "DEPOSIT") deposits += t.amount;
      else if (t.type === "PAYOUT") payouts += t.amount;
      else if (t.type === "LESSON_PAYMENT") {
        if (t.amount < 0) studentSpend += t.amount;
        else coachEarn += t.amount;
      } else if (t.type === "LESSON_REFUND") {
        if (t.amount > 0) studentSpend += t.amount;
        else clawback += t.amount;
      }
    }

    const wallet = deposits + studentSpend;
    const pending = coachEarn + payouts + clawback;
    const totalEarned = coachEarn + clawback;

    const changes: string[] = [];
    if (wallet !== user.walletBalance)
      changes.push(`wallet ${fmt(user.walletBalance)} → ${fmt(wallet)}`);
    if (reserved !== user.reservedBalance)
      changes.push(`reserved ${fmt(user.reservedBalance)} → ${fmt(reserved)}`);
    if (pending !== user.pendingEarnings)
      changes.push(`pending ${fmt(user.pendingEarnings)} → ${fmt(pending)}`);
    if (totalEarned !== user.totalEarningsAllTime)
      changes.push(`totalEarned ${fmt(user.totalEarningsAllTime)} → ${fmt(totalEarned)}`);

    if (changes.length === 0) continue;

    drifted++;
    console.log(`\n${user.username ?? user.id}:`);
    for (const c of changes) console.log(`  • ${c}`);

    if (COMMIT) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          walletBalance: wallet,
          reservedBalance: reserved,
          pendingEarnings: pending,
          totalEarningsAllTime: totalEarned,
        },
      });
    }
  }

  console.log(
    `\n${drifted} account(s) had drift. ${
      COMMIT ? "Corrections applied." : "Dry run — re-run with --commit to apply."
    }`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
