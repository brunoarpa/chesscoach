/**
 * One-off balance reconciliation script.
 *
 * Recomputes each user's wallet/earnings fields from authoritative sources and
 * reports (and optionally fixes) any drift. Written to clean up accounts left in
 * a bad state by the old no-show accounting bug (money created on student
 * no-shows) and the concurrent-cron double-decrement of reservedBalance.
 *
 *   npx tsx prisma/repair-balances.ts            # dry run - prints drift, writes nothing
 *   npx tsx prisma/repair-balances.ts --commit   # apply the corrections
 *
 * reservedBalance is always recomputed from live lessons - it is fully
 * derivable and the field most likely to be corrupted (it went negative).
 *
 * walletBalance / pendingEarnings / totalEarningsAllTime are only rewritten when
 * the RAW (non-deduplicated) ledger already equals the stored value - proving the
 * field is fully ledger-backed and the sole error is a duplicate row left by the
 * double-processing bug. We then write the DEDUPLICATED total. If the raw ledger
 * doesn't match the stored value (e.g. balances seeded directly in the DB without
 * DEPOSIT rows), the field is reported but NOT touched, so we never wipe out
 * manually-entered money.
 *
 * Sources of truth (ledger):
 *   walletBalance        = deposits + student lesson payments (negative) + student refunds.
 *   pendingEarnings      = coach lesson earnings − payouts − clawbacks.
 *   totalEarningsAllTime = coach lesson earnings − clawbacks.
 *   reservedBalance      = Σ estimatedCost of the student's non-trial lessons that
 *                          are still live (PENDING / ACCEPTED / IN_PROGRESS / DISPUTED).
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

    // Sum the ledger both with and without duplicate lesson rows. A field is
    // only safe to auto-correct when the RAW sum equals the stored value (proving
    // it's fully ledger-backed); we then write the DEDUPED sum.
    const sum = (dedupe: boolean) => {
      const s = { deposits: 0, studentSpend: 0, coachEarn: 0, clawback: 0, payouts: 0 };
      const local = new Set<string>();
      for (const t of txns) {
        if (dedupe && (t.type === "LESSON_PAYMENT" || t.type === "LESSON_REFUND") && t.lessonRequestId) {
          const key = `${t.lessonRequestId}:${t.type}:${t.amount < 0 ? "-" : "+"}`;
          if (local.has(key)) continue;
          local.add(key);
        }
        if (t.type === "DEPOSIT") s.deposits += t.amount;
        else if (t.type === "PAYOUT") s.payouts += t.amount;
        else if (t.type === "LESSON_PAYMENT") {
          if (t.amount < 0) s.studentSpend += t.amount;
          else s.coachEarn += t.amount;
        } else if (t.type === "LESSON_REFUND") {
          if (t.amount > 0) s.studentSpend += t.amount;
          else s.clawback += t.amount;
        }
      }
      return s;
    };
    const raw = sum(false);
    const ded = sum(true);

    const wallet = { raw: raw.deposits + raw.studentSpend, ded: ded.deposits + ded.studentSpend };
    const pending = { raw: raw.coachEarn + raw.payouts + raw.clawback, ded: ded.coachEarn + ded.payouts + ded.clawback };
    const totalEarned = { raw: raw.coachEarn + raw.clawback, ded: ded.coachEarn + ded.clawback };

    const writes: Record<string, number> = {};
    const lines: string[] = [];

    // reservedBalance: always authoritative.
    if (reserved !== user.reservedBalance) {
      writes.reservedBalance = reserved;
      lines.push(`reserved ${fmt(user.reservedBalance)} → ${fmt(reserved)}`);
    }

    // Ledger fields: auto-correct only when raw ledger matches stored value.
    const ledgerField = (
      name: string,
      key: "walletBalance" | "pendingEarnings" | "totalEarningsAllTime",
      stored: number,
      vals: { raw: number; ded: number },
    ) => {
      if (vals.ded === stored) return; // already correct
      if (vals.raw === stored) {
        writes[key] = vals.ded;
        lines.push(`${name} ${fmt(stored)} → ${fmt(vals.ded)} (removed duplicate ledger row)`);
      } else {
        lines.push(
          `${name} ${fmt(stored)} - NOT auto-fixed (ledger reconstructs to ${fmt(vals.ded)}; balance isn't fully ledger-backed, e.g. seeded directly). Adjust manually if needed.`,
        );
      }
    };
    ledgerField("wallet", "walletBalance", user.walletBalance, wallet);
    ledgerField("pending", "pendingEarnings", user.pendingEarnings, pending);
    ledgerField("totalEarned", "totalEarningsAllTime", user.totalEarningsAllTime, totalEarned);

    if (lines.length === 0) continue;

    drifted++;
    console.log(`\n${user.username ?? user.id}:`);
    for (const l of lines) console.log(`  • ${l}`);

    if (COMMIT && Object.keys(writes).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data: writes });
    }
  }

  console.log(
    `\n${drifted} account(s) had drift. ${
      COMMIT ? "Corrections applied." : "Dry run - re-run with --commit to apply."
    }`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
