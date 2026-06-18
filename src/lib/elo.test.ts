import { describe, it, expect, vi } from "vitest";

// elo.ts imports the runtime Prisma singleton at module load; replace it so the
// test never constructs a real DB client. calculateCoachElo takes a `db` arg,
// so we pass our own fake and this mock is only to satisfy the import.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { calculateCoachElo } from "@/lib/elo";

type FakeUser = {
  lastActiveAt: Date;
  coachRatingPenalty?: number | null;
};
type FakeReview = { rating: number };
type FakeRequest = {
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  acceptanceDeadline: Date | null;
};

// Build a minimal db whose reads return the values the formula uses.
function makeDb(
  user: FakeUser | null,
  opts: { reviews?: FakeReview[]; requests?: FakeRequest[]; completed?: number } = {},
) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    review: { findMany: vi.fn().mockResolvedValue(opts.reviews ?? []) },
    lessonRequest: {
      findMany: vi.fn().mockResolvedValue(opts.requests ?? []),
      count: vi.fn().mockResolvedValue(opts.completed ?? 0),
    },
  } as unknown as Parameters<typeof calculateCoachElo>[1];
}

const now = () => new Date();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

// An answered request: respondedAt set, accepted promptly.
const accepted = (): FakeRequest => ({
  status: "ACCEPTED",
  createdAt: hoursAgo(2),
  respondedAt: hoursAgo(1.5),
  acceptanceDeadline: hoursAgo(0),
});
// A ghosted request the coach had a fair chance (>2h) to answer.
const ghosted = (): FakeRequest => ({
  status: "EXPIRED",
  createdAt: daysAgo(2),
  respondedAt: null,
  acceptanceDeadline: new Date(daysAgo(2).getTime() + 24 * 60 * 60 * 1000),
});

describe("calculateCoachElo", () => {
  it("gives a fresh coach with no history a sane neutral score (~1116)", async () => {
    const elo = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }));
    // 100 + 150 + 600·0.75 + 400·0.9 + 80·0.7 = 1116
    expect(elo).toBeGreaterThanOrEqual(1110);
    expect(elo).toBeLessThanOrEqual(1120);
  });

  it("rises with better reviews", async () => {
    const low = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }, {
      reviews: [{ rating: 2 }, { rating: 2 }, { rating: 3 }],
    }));
    const high = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }, {
      reviews: [{ rating: 5 }, { rating: 5 }, { rating: 5 }],
    }));
    expect(high).toBeGreaterThan(low);
  });

  it("rises with completed lessons", async () => {
    const base = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }));
    const seasoned = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }, { completed: 50 }));
    expect(seasoned).toBeGreaterThan(base);
  });

  it("falls when the coach ghosts requests", async () => {
    const responsive = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }, {
      requests: [accepted(), accepted(), accepted()],
    }));
    const ghoster = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }, {
      requests: [ghosted(), ghosted(), ghosted()],
    }));
    expect(ghoster).toBeLessThan(responsive);
  });

  it("decays the small activity bonus as inactivity grows", async () => {
    const active = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }));
    const stale = await calculateCoachElo("c", makeDb({ lastActiveAt: daysAgo(30) }));
    expect(stale).toBeLessThan(active);
    // But the swing is small now (<= the ~150 activity bonus), unlike before.
    expect(active - stale).toBeLessThanOrEqual(160);
  });

  it("subtracts the no-show penalty", async () => {
    const clean = await calculateCoachElo("c", makeDb({ lastActiveAt: now() }));
    const penalised = await calculateCoachElo("c", makeDb({ lastActiveAt: now(), coachRatingPenalty: 200 }));
    expect(clean - penalised).toBeGreaterThanOrEqual(199);
    expect(clean - penalised).toBeLessThanOrEqual(201);
  });

  it("never goes negative, even with an enormous penalty", async () => {
    const elo = await calculateCoachElo("c", makeDb({ lastActiveAt: now(), coachRatingPenalty: 100000 }));
    expect(elo).toBe(0);
  });

  it("returns a sane default for a missing user", async () => {
    const elo = await calculateCoachElo("missing", makeDb(null));
    expect(elo).toBe(250); // BASE + ACTIVITY_BONUS
  });
});
