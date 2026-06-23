import { describe, it, expect } from "vitest";
import {
  classifyMove,
  evalToCp,
  winChance,
  moveAccuracy,
  estimateRating,
  summarizeGame,
} from "@/lib/game-review";

describe("evalToCp", () => {
  it("passes through centipawns and pins mate to a large magnitude", () => {
    expect(evalToCp({ cp: 35, mate: null })).toBe(35);
    expect(evalToCp({ cp: null, mate: 3 })).toBe(100000);
    expect(evalToCp({ cp: null, mate: -2 })).toBe(-100000);
    expect(evalToCp({ cp: null, mate: null })).toBe(0);
  });
});

describe("classifyMove", () => {
  it("calls a move that keeps the best eval 'best'", () => {
    expect(classifyMove(50, 50, true)).toBe("best");
  });

  it("calls a large drop for the mover a blunder", () => {
    // White was +5, ends up -3: a huge loss in expected points.
    expect(classifyMove(500, -300, true)).toBe("blunder");
  });

  it("is symmetric for black (a drop in black's favor is a blunder)", () => {
    // Black to move at -5 (great for black), ends at +3 (great for white).
    expect(classifyMove(-500, 300, false)).toBe("blunder");
  });

  it("treats a tiny slip as an inaccuracy, not a blunder", () => {
    const cls = classifyMove(20, -40, true);
    expect(["excellent", "good", "inaccuracy"]).toContain(cls);
  });
});

describe("winChance", () => {
  it("is 50% at a dead-equal position and monotonic in the eval", () => {
    expect(winChance(0)).toBeCloseTo(50, 5);
    expect(winChance(300)).toBeGreaterThan(winChance(0));
    expect(winChance(-300)).toBeLessThan(winChance(0));
  });
});

describe("moveAccuracy", () => {
  it("is ~100 when win% does not drop", () => {
    expect(moveAccuracy(60, 60)).toBeGreaterThan(99);
  });

  it("falls as the win% drop grows and never goes negative", () => {
    expect(moveAccuracy(80, 40)).toBeLessThan(moveAccuracy(80, 70));
    expect(moveAccuracy(90, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe("estimateRating", () => {
  it("is monotonic and clamped to a human range", () => {
    expect(estimateRating(100)).toBeGreaterThan(estimateRating(50));
    expect(estimateRating(0)).toBeGreaterThanOrEqual(250);
    expect(estimateRating(100)).toBeLessThanOrEqual(2900);
  });
});

describe("summarizeGame", () => {
  it("splits moves by side and a clean game scores high accuracy", () => {
    // Root, then four near-equal positions: both sides play well.
    const evals = [10, 12, 8, 11, 9];
    const s = summarizeGame(evals, true);
    expect(s.white.moveCount).toBe(2); // moves 1 and 3
    expect(s.black.moveCount).toBe(2); // moves 2 and 4
    expect(s.white.accuracy).toBeGreaterThan(90);
    expect(s.black.accuracy).toBeGreaterThan(90);
    expect(s.graph).toHaveLength(5);
  });

  it("attributes a white blunder to white only", () => {
    // Move 1 (white) tanks the eval from +5 to -3; rest are quiet.
    const evals = [500, -300, -300];
    const s = summarizeGame(evals, true);
    expect(s.white.counts.blunder).toBe(1);
    expect(s.black.counts.blunder).toBe(0);
  });

  it("clamps the graph to +/- 1000 cp", () => {
    const s = summarizeGame([0, 100000, -100000], true);
    expect(s.graph).toEqual([0, 1000, -1000]);
  });
});
