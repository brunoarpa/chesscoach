import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { derivePuzzle, isCorrectMove, puzzleSlug, unlockedCount } from "@/lib/puzzles";

// Scholar's mate: 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#
const SCHOLARS = "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#";

describe("derivePuzzle", () => {
  it("takes the last ply as a one-move puzzle", () => {
    const p = derivePuzzle(SCHOLARS, 1);
    expect(p.solution).toEqual(["Qxf7#"]);
    expect(p.sideToMove).toBe("w");
    // White to move, having just seen ...Nf6.
    expect(p.fen).toContain(" w ");
  });

  it("interleaves opponent replies for a multi-move puzzle", () => {
    const p = derivePuzzle(SCHOLARS, 3);
    // solver, opponent, solver
    expect(p.solution).toEqual(["Qh5", "Nf6", "Qxf7#"]);
    expect(p.sideToMove).toBe("w");
  });

  it("can start from the black side", () => {
    const p = derivePuzzle(SCHOLARS, 2);
    expect(p.solution).toEqual(["Nf6", "Qxf7#"]);
    expect(p.sideToMove).toBe("b");
  });

  it("produces a legal, replayable start position", () => {
    const p = derivePuzzle(SCHOLARS, 3);
    expect(isCorrectMove(p.fen, "Qh5", p.solution[0])).toBe(true);
  });

  it("captures the opponent move that leads into the puzzle", () => {
    const p = derivePuzzle(SCHOLARS, 1);
    // The ply before Qxf7# is Black's ...Nf6.
    expect(p.setupMove).toBe("Nf6");
    // Played from a position where it is Black's turn.
    expect(p.setupFen).toContain(" b ");
    // And replaying it must land exactly on the puzzle position.
    const board = new Chess(p.setupFen!);
    board.move(p.setupMove!);
    expect(board.fen()).toBe(p.fen);
  });

  it("has no setup move when the solution is the whole game", () => {
    const p = derivePuzzle("1. f3 e5 2. g4 Qh4#", 4);
    expect(p.setupMove).toBeNull();
    expect(p.setupFen).toBeNull();
  });

  it("rejects a solution longer than the game", () => {
    expect(() => derivePuzzle(SCHOLARS, 99)).toThrow(/only 7 half-moves/);
  });

  it("rejects a non-positive or fractional length", () => {
    expect(() => derivePuzzle(SCHOLARS, 0)).toThrow(/at least 1/);
    expect(() => derivePuzzle(SCHOLARS, 1.5)).toThrow(/whole number/);
  });

  it("rejects a PGN with no moves", () => {
    expect(() => derivePuzzle('[Event "empty"]', 1)).toThrow(/no moves/);
  });
});

describe("isCorrectMove", () => {
  const { fen, solution } = derivePuzzle(SCHOLARS, 1);

  it("accepts the expected move", () => {
    expect(isCorrectMove(fen, solution[0], solution[0])).toBe(true);
  });

  it("accepts a differently spelled but identical move", () => {
    // Same move without the checkmate suffix.
    expect(isCorrectMove(fen, "Qxf7", "Qxf7#")).toBe(true);
  });

  it("rejects a legal but wrong move", () => {
    expect(isCorrectMove(fen, "d3", solution[0])).toBe(false);
  });

  it("rejects an illegal move instead of throwing", () => {
    expect(isCorrectMove(fen, "Qxa8", solution[0])).toBe(false);
    expect(isCorrectMove(fen, "not-a-move", solution[0])).toBe(false);
  });
});

describe("unlockedCount", () => {
  const ids = ["a", "b", "c", "d"];

  it("opens only the first puzzle when nothing is solved", () => {
    expect(unlockedCount(ids, new Set())).toBe(1);
  });

  it("opens the next puzzle after each solve", () => {
    expect(unlockedCount(ids, new Set(["a"]))).toBe(2);
    expect(unlockedCount(ids, new Set(["a", "b"]))).toBe(3);
  });

  it("stops at the first gap, ignoring later solves", () => {
    expect(unlockedCount(ids, new Set(["a", "c", "d"]))).toBe(2);
  });

  it("never exceeds the tier length", () => {
    expect(unlockedCount(ids, new Set(ids))).toBe(4);
  });

  it("handles an empty tier", () => {
    expect(unlockedCount([], new Set())).toBe(0);
  });
});

describe("puzzleSlug", () => {
  it("combines tier, position and title", () => {
    expect(puzzleSlug(3, 12, "Back rank mate")).toBe("3-12-back-rank-mate");
  });

  it("falls back to tier and position without a title", () => {
    expect(puzzleSlug(1, 4, null)).toBe("1-4");
    expect(puzzleSlug(1, 4, "   ")).toBe("1-4");
  });

  it("strips punctuation and caps the length", () => {
    expect(puzzleSlug(2, 1, "Tal's *brilliant* queen sac, move six!")).toBe(
      "2-1-tals-brilliant-queen-sac-move",
    );
  });
});
