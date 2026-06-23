// Pure game-review math: move classification, accuracy, and an (approximate)
// estimated rating. Kept framework-free so it is unit-testable and shared
// between the live board markers and the whole-game report card.

// Move quality classification (chess.com-style labels).
export type MoveClass = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

export const MOVE_CLASSES: MoveClass[] = [
  "best",
  "excellent",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
];

// chess.com's win-probability constant. Maps a centipawn eval to a 0..1 win
// chance via a logistic curve.
const WIN_PROB_K = 0.00368208;

// Centipawns (white perspective) -> expected points / win chance, 0..1.
export function cpToExpectedPoints(cp: number): number {
  return 1 / (1 + Math.exp(-WIN_PROB_K * cp));
}

// Win chance as a 0..100 percentage, used by the accuracy formula.
export function winChance(cp: number): number {
  return 100 * cpToExpectedPoints(cp);
}

// Flatten an engine line (cp or mate) to a single white-perspective centipawn
// number. Mate is pinned to a large magnitude so it dominates the curve.
export function evalToCp(line: { cp: number | null; mate: number | null }): number {
  if (line.mate !== null) return line.mate > 0 ? 100000 : -100000;
  return line.cp ?? 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Classify by expected points *lost* by the move (mover perspective).
// Best 0, Excellent <=0.02, Good <=0.05, Inaccuracy <=0.10, Mistake <=0.20, else Blunder.
export function classifyByExpectedPointsLost(loss: number): MoveClass {
  if (loss <= 0) return "best";
  if (loss <= 0.02) return "excellent";
  if (loss <= 0.05) return "good";
  if (loss <= 0.1) return "inaccuracy";
  if (loss <= 0.2) return "mistake";
  return "blunder";
}

// Classify a played move: how much did the position's expected points drop from
// the best available (before) to the result (after)? Both evals are
// white-perspective centipawns.
export function classifyMove(parentBestCp: number, resultCp: number, moverIsWhite: boolean): MoveClass {
  const sign = moverIsWhite ? 1 : -1;
  const epBefore = cpToExpectedPoints(sign * parentBestCp);
  const epAfter = cpToExpectedPoints(sign * resultCp);
  return classifyByExpectedPointsLost(Math.max(0, epBefore - epAfter));
}

// Per-move accuracy 0..100 from the win% before and after the move (both from
// the mover's perspective). This is the Lichess accuracy curve.
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return clamp(acc, 0, 100);
}

// Whole-game accuracy: the mean of the per-move accuracies. Returns 0 for an
// empty list so callers can guard on move count.
export function gameAccuracy(perMove: number[]): number {
  if (perMove.length === 0) return 0;
  return perMove.reduce((a, b) => a + b, 0) / perMove.length;
}

// Rough estimated rating from accuracy. This is an approximation, not chess.com's
// proprietary CAPS, and is labelled as such in the UI. Calibrated conservatively
// (80% accuracy ~ 1200, 90% ~ 1730, 95% ~ 2000) so it doesn't read high.
// Monotonic in accuracy and clamped to a sane human range.
export function estimateRating(accuracy: number): number {
  return Math.round(clamp((accuracy - 80) * 53 + 1200, 250, 2800));
}

export interface SideSummary {
  accuracy: number;
  estRating: number;
  moveCount: number;
  counts: Record<MoveClass, number>;
}

export interface GameReviewSummary {
  white: SideSummary;
  black: SideSummary;
  // White-perspective centipawn eval after each position (root first), clamped
  // for charting.
  graph: number[];
}

const GRAPH_CLAMP = 1000; // +/- 10 pawns

function emptyCounts(): Record<MoveClass, number> {
  return { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
}

// Build the whole-game summary from the white-perspective best eval at each
// mainline position (root first, then one per ply). `firstMoverWhite` is true
// for a normal game; FEN-start games may differ.
export function summarizeGame(evalsWhite: number[], firstMoverWhite = true): GameReviewSummary {
  const white: SideSummary = { accuracy: 0, estRating: 0, moveCount: 0, counts: emptyCounts() };
  const black: SideSummary = { accuracy: 0, estRating: 0, moveCount: 0, counts: emptyCounts() };
  const whiteAcc: number[] = [];
  const blackAcc: number[] = [];

  for (let i = 1; i < evalsWhite.length; i++) {
    const parent = evalsWhite[i - 1];
    const child = evalsWhite[i];
    if (!Number.isFinite(parent) || !Number.isFinite(child)) continue;
    // Move i (1-indexed) is white's when i is odd in a normal game.
    const moverIsWhite = firstMoverWhite ? i % 2 === 1 : i % 2 === 0;
    const sign = moverIsWhite ? 1 : -1;
    const cls = classifyMove(parent, child, moverIsWhite);
    const acc = moveAccuracy(winChance(sign * parent), winChance(sign * child));
    const side = moverIsWhite ? white : black;
    side.counts[cls] += 1;
    side.moveCount += 1;
    (moverIsWhite ? whiteAcc : blackAcc).push(acc);
  }

  white.accuracy = Math.round(gameAccuracy(whiteAcc) * 10) / 10;
  black.accuracy = Math.round(gameAccuracy(blackAcc) * 10) / 10;
  white.estRating = white.moveCount > 0 ? estimateRating(white.accuracy) : 0;
  black.estRating = black.moveCount > 0 ? estimateRating(black.accuracy) : 0;

  const graph = evalsWhite.map((cp) => clamp(cp, -GRAPH_CLAMP, GRAPH_CLAMP));

  return { white, black, graph };
}
