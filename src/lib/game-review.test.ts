import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  classifyMove,
  classifyDetailed,
  isSacrificeMove,
  evalToCp,
  winChance,
  moveAccuracy,
  calibrateAccuracy,
  estimateRating,
  summarizeGame,
  type ReviewPosition,
} from "@/lib/game-review";

// Build a ReviewPosition[] by replaying SANs from the start position and
// pairing each resulting FEN with a supplied white-perspective eval (cp).
function positionsFrom(sans: string[], cps: number[]): ReviewPosition[] {
  const g = new Chess();
  const out: ReviewPosition[] = [{ fen: g.fen(), cp: cps[0] }];
  sans.forEach((san, i) => {
    g.move(san);
    out.push({ fen: g.fen(), cp: cps[i + 1] });
  });
  return out;
}

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
    expect(classifyMove(500, -300, true)).toBe("blunder");
  });

  it("is symmetric for black (a drop in black's favor is a blunder)", () => {
    expect(classifyMove(-500, 300, false)).toBe("blunder");
  });

  it("treats a tiny slip as an inaccuracy, not a blunder", () => {
    const cls = classifyMove(20, -40, true);
    expect(["excellent", "good", "inaccuracy"]).toContain(cls);
  });
});

describe("classifyDetailed", () => {
  const base = {
    parentBestCp: 50,
    playedCp: 50,
    secondBestCp: 40,
    moverIsWhite: true,
    legalMoveCount: 30,
    playedIsBest: true,
    isSacrifice: false,
  };

  it("labels a one-legal-move position 'forced'", () => {
    expect(classifyDetailed({ ...base, legalMoveCount: 1 })).toBe("forced");
  });

  it("labels a sound piece sacrifice 'brilliant'", () => {
    // Best move, gives up material, not already winning, still fine after.
    expect(
      classifyDetailed({ ...base, parentBestCp: 80, playedCp: 70, isSacrifice: true }),
    ).toBe("brilliant");
  });

  it("does not call a sacrifice brilliant when already completely winning", () => {
    // +900 before => already won, so a sac here is not 'brilliant'.
    const cls = classifyDetailed({ ...base, parentBestCp: 2000, playedCp: 1900, isSacrifice: true });
    expect(cls).not.toBe("brilliant");
  });

  it("labels the only good move 'great' when the 2nd-best is far worse", () => {
    // Best keeps roughly equal (+20 -> ~0.52 EP); 2nd-best is losing (-300).
    const cls = classifyDetailed({
      ...base,
      parentBestCp: 20,
      playedCp: 20,
      secondBestCp: -300,
    });
    expect(cls).toBe("great");
  });

  it("labels throwing away a winning position 'miss'", () => {
    // Was completely winning (+600), played a move that drops to equal (0).
    const cls = classifyDetailed({
      ...base,
      parentBestCp: 600,
      playedCp: 0,
      playedIsBest: false,
    });
    expect(cls).toBe("miss");
  });

  it("keeps a blunder that collapses into a loss as a blunder, not a miss", () => {
    // Winning (+600) -> losing (-400): a full collapse, so it stays a blunder.
    const cls = classifyDetailed({
      ...base,
      parentBestCp: 600,
      playedCp: -400,
      playedIsBest: false,
    });
    expect(cls).toBe("blunder");
  });

  it("does not call a mistake-sized squander a miss (miss is blunder-only)", () => {
    // Winning (+400) -> still better (+150): only a mistake-sized drop, not a miss.
    const cls = classifyDetailed({
      ...base,
      parentBestCp: 400,
      playedCp: 150,
      playedIsBest: false,
    });
    expect(cls).not.toBe("miss");
  });

  it("falls back to the plain ladder otherwise", () => {
    expect(classifyDetailed({ ...base, parentBestCp: 20, playedCp: -40, playedIsBest: false, secondBestCp: 10 })).toBe(
      "inaccuracy",
    );
  });
});

describe("isSacrificeMove", () => {
  it("detects giving up a piece that the opponent then wins", () => {
    // White to move, even material. White plays a move; one ply later White is
    // down a knight (net -3). That's a sacrifice.
    const parent = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const child = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"; // even
    const next = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKB1R w KQkq - 0 2"; // white lost a knight
    expect(isSacrificeMove(parent, child, next, true)).toBe(true);
  });

  it("does not flag an even position as a sacrifice", () => {
    const even = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(isSacrificeMove(even, even, even, true)).toBe(false);
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

describe("calibrateAccuracy", () => {
  it("maps our raw accuracy down onto the chess.com scale", () => {
    // Calibration anchors (raw -> chess.com), within a couple points.
    expect(calibrateAccuracy(92.4)).toBeCloseTo(80, 0);
    expect(calibrateAccuracy(84)).toBeCloseTo(65.6, 0);
    expect(calibrateAccuracy(100)).toBeLessThanOrEqual(100);
    expect(calibrateAccuracy(0)).toBeGreaterThanOrEqual(0);
  });
});

describe("estimateRating", () => {
  it("is monotonic and clamped to a human range", () => {
    expect(estimateRating(100)).toBeGreaterThan(estimateRating(50));
    expect(estimateRating(0)).toBeGreaterThanOrEqual(250);
    expect(estimateRating(100)).toBeLessThanOrEqual(2900);
  });

  it("lands near chess.com's ratings on the calibration anchors", () => {
    // ~80% (chess.com scale) ~ 2000, ~66% ~ 1600.
    expect(estimateRating(80)).toBeGreaterThan(1900);
    expect(estimateRating(80)).toBeLessThan(2100);
    expect(estimateRating(66)).toBeGreaterThan(1500);
    expect(estimateRating(66)).toBeLessThan(1700);
  });
});

describe("summarizeGame", () => {
  it("splits moves by side and a clean game scores high accuracy", () => {
    const positions = positionsFrom(["e4", "e5", "Nf3", "Nc6"], [10, 12, 8, 11, 9]);
    const s = summarizeGame(positions);
    expect(s.white.moveCount).toBe(2); // moves 1 and 3
    expect(s.black.moveCount).toBe(2); // moves 2 and 4
    expect(s.white.accuracy).toBeGreaterThan(85);
    expect(s.black.accuracy).toBeGreaterThan(85);
    expect(s.graph).toHaveLength(5);
  });

  it("attributes a white blunder to white only", () => {
    // White's first move tanks the eval from +500 to -300.
    const positions = positionsFrom(["e4", "e5"], [500, -300, -300]);
    const s = summarizeGame(positions);
    expect(s.white.counts.blunder).toBe(1);
    expect(s.black.counts.blunder).toBe(0);
  });

  it("clamps the graph to +/- 1000 cp", () => {
    const positions = positionsFrom(["e4", "e5"], [0, 100000, -100000]);
    const s = summarizeGame(positions);
    expect(s.graph).toEqual([0, 1000, -1000]);
  });
});
