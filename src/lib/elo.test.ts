import { describe, it, expect, vi } from "vitest";

// elo.ts imports the runtime Prisma singleton at module load; replace it so the
// test never constructs a real DB client. calculateCoachElo takes a `db` arg,
// so we pass our own fake and this mock is only to satisfy the import.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { calculateCoachElo } from "@/lib/elo";

type FakeUser = {
  createdAt: Date;
  lastActiveAt: Date;
  coachRatingPenalty?: number | null;
};
type FakeEarning = { amount: number; earnedAt: Date };

// Build a minimal db whose two reads return the values the formula uses.
function makeDb(user: FakeUser | null, earnings: FakeEarning[] = []) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    earningRecord: { findMany: vi.fn().mockResolvedValue(earnings) },
  } as unknown as Parameters<typeof calculateCoachElo>[1];
}

const now = () => new Date();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

describe("calculateCoachElo", () => {
  it("gives a fresh, fully-active coach with no earnings ~1000 (100 + 500 + 400)", async () => {
    const elo = await calculateCoachElo("c", makeDb({ createdAt: now(), lastActiveAt: now() }));
    expect(elo).toBeGreaterThanOrEqual(999);
    expect(elo).toBeLessThanOrEqual(1000);
  });

  it("falls as site inactivity grows (activity bonus decays)", async () => {
    const active = await calculateCoachElo("c", makeDb({ createdAt: daysAgo(60), lastActiveAt: now() }));
    const stale = await calculateCoachElo("c", makeDb({ createdAt: daysAgo(60), lastActiveAt: daysAgo(30) }));
    expect(stale).toBeLessThan(active);
  });

  it("rises with lifetime earnings", async () => {
    const base = await calculateCoachElo("c", makeDb({ createdAt: now(), lastActiveAt: now() }));
    const earner = await calculateCoachElo(
      "c",
      makeDb({ createdAt: now(), lastActiveAt: now() }, [{ amount: 50000, earnedAt: now() }]),
    );
    expect(earner).toBeGreaterThan(base);
  });

  it("subtracts the no-show penalty", async () => {
    const clean = await calculateCoachElo("c", makeDb({ createdAt: now(), lastActiveAt: now() }));
    const penalised = await calculateCoachElo(
      "c",
      makeDb({ createdAt: now(), lastActiveAt: now(), coachRatingPenalty: 200 }),
    );
    expect(clean - penalised).toBeGreaterThanOrEqual(199);
    expect(clean - penalised).toBeLessThanOrEqual(201);
  });

  it("never goes negative, even with an enormous penalty", async () => {
    const elo = await calculateCoachElo(
      "c",
      makeDb({ createdAt: now(), lastActiveAt: now(), coachRatingPenalty: 100000 }),
    );
    expect(elo).toBe(0);
  });

  it("returns a sane default for a missing user", async () => {
    const elo = await calculateCoachElo("missing", makeDb(null));
    expect(elo).toBe(1000); // BASE + ACTIVITY_BONUS + EARNING_BONUS
  });
});
