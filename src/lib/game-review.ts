// Pure game-review math: move classification, accuracy, and an (approximate)
// estimated rating. Kept dependency-light (only chess.js, for material/legal-move
// inspection) so it is unit-testable and shared between the live board markers
// and the whole-game report card.

import { Chess } from "chess.js";

// Move quality classification (chess.com-style labels). The first three are the
// "special good" labels, then the neutral/forced, then the plain quality ladder.
export type MoveClass =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "forced"
  | "inaccuracy"
  | "miss"
  | "mistake"
  | "blunder";

export const MOVE_CLASSES: MoveClass[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "forced",
  "inaccuracy",
  "miss",
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

// Classify a played move using only parent-best vs result evals (both
// white-perspective centipawns). This is the simple ladder (best..blunder) used
// where the richer context (sacrifice/second-best/forced) isn't available.
export function classifyMove(parentBestCp: number, resultCp: number, moverIsWhite: boolean): MoveClass {
  const sign = moverIsWhite ? 1 : -1;
  const epBefore = cpToExpectedPoints(sign * parentBestCp);
  const epAfter = cpToExpectedPoints(sign * resultCp);
  return classifyByExpectedPointsLost(Math.max(0, epBefore - epAfter));
}

// ---- chess.com-style special classifications ----

export interface MoveContext {
  parentBestCp: number; // white persp: eval of the best move at the parent
  playedCp: number; // white persp: eval after the move actually played
  secondBestCp: number | null; // white persp: eval of the 2nd-best move at the parent
  moverIsWhite: boolean;
  legalMoveCount: number; // legal moves available at the parent
  playedIsBest: boolean; // did the player play the engine's top move?
  isSacrifice: boolean; // did the move concede material (>= ~a minor piece)?
}

// Thresholds for the special labels. Kept named so they're easy to tune as more
// calibration games come in.
const GREAT_SECOND_BEST_GAP = 0.12; // how much worse the 2nd-best move must be
// A Miss is a blunder-sized error that throws away a winning position back to
// roughly equal - "you failed to capitalize". It is deliberately a *subset of
// blunders* (not mistakes), so it stays rare and never fires on small swings:
//  - you were clearly winning before the move (>= MISS_WINNING_BEFORE EP), and
//  - you ended only roughly equal, not in a losing position (a true collapse
//    into a loss is a plain Blunder, not a missed win).
const MISS_WINNING_BEFORE = 0.75;
const MISS_AFTER_MIN = 0.45;
const MISS_AFTER_MAX = 0.62;
const BRILLIANT_MIN_EP_AFTER = 0.5; // you're not losing after the sacrifice
const BRILLIANT_MAX_EP_BEFORE = 0.97; // and weren't already completely winning

// Full classification using the richer context. Priority mirrors chess.com:
// forced (no choice) > brilliant/great (special good) > miss > plain ladder.
export function classifyDetailed(ctx: MoveContext): MoveClass {
  const { parentBestCp, playedCp, secondBestCp, moverIsWhite, legalMoveCount, playedIsBest, isSacrifice } = ctx;
  const sign = moverIsWhite ? 1 : -1;
  const epBest = cpToExpectedPoints(sign * parentBestCp); // mover EP if best played
  const epAfter = cpToExpectedPoints(sign * playedCp); // mover EP after the played move
  const loss = Math.max(0, epBest - epAfter);
  const base = classifyByExpectedPointsLost(loss);

  // Forced: only one legal move - the player had no real choice.
  if (legalMoveCount <= 1) return "forced";

  // Special "good" labels only apply when the move is essentially the engine's
  // pick (exactly best, or within a hair of it).
  const playedWellEnough = playedIsBest || loss <= 0.02;
  if (playedWellEnough) {
    // Brilliant: a sound piece sacrifice, made from a not-already-won position,
    // that still leaves you at least equal.
    if (isSacrifice && epBest < BRILLIANT_MAX_EP_BEFORE && epAfter >= BRILLIANT_MIN_EP_AFTER) {
      return "brilliant";
    }
    // Great: the only good move - the second-best was clearly worse, and the
    // position is still contested (not already totally winning or lost).
    if (secondBestCp !== null && epBest > 0.1 && epBest < 0.95) {
      const epSecond = cpToExpectedPoints(sign * secondBestCp);
      if (epBest - epSecond >= GREAT_SECOND_BEST_GAP) return "great";
    }
  }

  // Miss: a blunder (real swing) that squandered a winning position back to
  // roughly equal - "you failed to capitalize on the opponent's mistake".
  // Subset of blunders only, so it stays uncommon and never triggers on small
  // changes; collapsing into a loss stays a plain blunder.
  if (
    base === "blunder" &&
    epBest >= MISS_WINNING_BEFORE &&
    epAfter >= MISS_AFTER_MIN &&
    epAfter <= MISS_AFTER_MAX
  ) {
    return "miss";
  }

  return base;
}

// ---- Material / position inspection (for the special labels) ----

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialFor(fen: string, white: boolean): number {
  const board = fen.split(" ")[0];
  let sum = 0;
  for (const ch of board) {
    if (white && ch >= "A" && ch <= "Z") sum += PIECE_VALUE[ch.toLowerCase()] ?? 0;
    else if (!white && ch >= "a" && ch <= "z") sum += PIECE_VALUE[ch] ?? 0;
  }
  return sum;
}

// The mover's material minus the opponent's, in pawns, at a given position.
function moverNet(fen: string, moverIsWhite: boolean): number {
  return moverIsWhite ? materialFor(fen, true) - materialFor(fen, false) : materialFor(fen, false) - materialFor(fen, true);
}

// A move is a sacrifice if, once the opponent has had a chance to capture (the
// position one ply later, when available), the mover ends up materially down by
// at least ~2 points (an exchange / minor piece) relative to before the move.
export function isSacrificeMove(
  parentFen: string,
  childFen: string,
  nextFen: string | null,
  moverIsWhite: boolean,
): boolean {
  const before = moverNet(parentFen, moverIsWhite);
  const afterChild = moverNet(childFen, moverIsWhite);
  const afterNext = nextFen ? moverNet(nextFen, moverIsWhite) : afterChild;
  const lowest = Math.min(afterChild, afterNext);
  return before - lowest >= 2;
}

// Did `bestSan` (the engine's top move at the parent) reproduce the position the
// player actually reached? If so, the player found the best move.
function playedTheBest(parentFen: string, bestSan: string | null, childFen: string): boolean {
  if (!bestSan) return false;
  try {
    const g = new Chess(parentFen);
    const m = g.move(bestSan);
    if (!m) return false;
    return g.fen() === childFen;
  } catch {
    return false;
  }
}

function legalMoveCount(fen: string): number {
  try {
    return new Chess(fen).moves().length;
  } catch {
    return 99; // unknown: treat as "many" so we never mislabel as forced
  }
}

// Engine read-out for a single position, white perspective. Shared by the live
// eval cache and the background review pass (both keyed by FEN).
export interface PosEval {
  cp: number; // best-move eval (centipawns)
  secondCp: number | null; // 2nd-best move eval, when MultiPV >= 2
  bestSan: string | null; // engine's best move in SAN
}

// Per-position info the review pass produces (root first, one per ply).
export interface ReviewPosition {
  fen: string;
  cp: number; // white-perspective best eval (centipawns)
  secondCp?: number | null; // white-perspective 2nd-best eval
  bestSan?: string | null; // engine's best move SAN at this position
}

// Classify one played move from the position before it (`parent`), the position
// it reached (`child`), and the position one ply later (`next`, for sacrifice
// detection). Does the chess.js work, then defers to classifyDetailed.
export function classifyPlayedMove(
  parent: ReviewPosition,
  child: Pick<ReviewPosition, "fen" | "cp">,
  next: Pick<ReviewPosition, "fen"> | null,
): MoveClass {
  const moverIsWhite = parent.fen.split(" ")[1] !== "b";
  return classifyDetailed({
    parentBestCp: parent.cp,
    playedCp: child.cp,
    secondBestCp: parent.secondCp ?? null,
    moverIsWhite,
    legalMoveCount: legalMoveCount(parent.fen),
    playedIsBest: playedTheBest(parent.fen, parent.bestSan ?? null, child.fen),
    isSacrifice: isSacrificeMove(parent.fen, child.fen, next?.fen ?? null, moverIsWhite),
  });
}

// Per-move accuracy 0..100 from the win% before and after the move (both from
// the mover's perspective). This is the Lichess accuracy curve.
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return clamp(acc, 0, 100);
}

// Whole-game raw accuracy: the mean of the per-move accuracies. Returns 0 for an
// empty list so callers can guard on move count.
export function gameAccuracy(perMove: number[]): number {
  if (perMove.length === 0) return 0;
  return perMove.reduce((a, b) => a + b, 0) / perMove.length;
}

// Map our raw (mean-of-Lichess-curve) accuracy onto the chess.com scale. The raw
// number reads systematically high versus chess.com's harsher accuracy; this
// linear transform was least-squares fit to chess.com's reported accuracies on
// calibration games (see game-review.test.ts). It is an approximation, fit to a
// small sample, and assumes the same engine search settings the app ships with.
export function calibrateAccuracy(raw: number): number {
  return clamp(1.712 * raw - 78.2, 0, 100);
}

// Estimated rating from the (already-calibrated, chess.com-scale) accuracy. Fit
// to chess.com's own accuracy->rating relationship on the calibration games:
// ~28 rating points per accuracy point. Clamped to a sane human range.
export function estimateRating(calibratedAccuracy: number): number {
  return Math.round(clamp(28.36 * calibratedAccuracy - 281, 250, 2800));
}

export interface SideSummary {
  accuracy: number; // chess.com-scale (calibrated)
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

export function emptyCounts(): Record<MoveClass, number> {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    forced: 0,
    inaccuracy: 0,
    miss: 0,
    mistake: 0,
    blunder: 0,
  };
}

// Build the whole-game summary from the per-position review data (root first,
// then one entry per ply of the main line).
export function summarizeGame(positions: ReviewPosition[]): GameReviewSummary {
  const white: SideSummary = { accuracy: 0, estRating: 0, moveCount: 0, counts: emptyCounts() };
  const black: SideSummary = { accuracy: 0, estRating: 0, moveCount: 0, counts: emptyCounts() };
  const whiteAcc: number[] = [];
  const blackAcc: number[] = [];

  for (let i = 1; i < positions.length; i++) {
    const parent = positions[i - 1];
    const child = positions[i];
    if (!Number.isFinite(parent.cp) || !Number.isFinite(child.cp)) continue;
    const moverIsWhite = parent.fen.split(" ")[1] !== "b";
    const sign = moverIsWhite ? 1 : -1;
    const cls = classifyPlayedMove(parent, child, positions[i + 1] ?? null);
    const acc = moveAccuracy(winChance(sign * parent.cp), winChance(sign * child.cp));
    const side = moverIsWhite ? white : black;
    side.counts[cls] += 1;
    side.moveCount += 1;
    (moverIsWhite ? whiteAcc : blackAcc).push(acc);
  }

  white.accuracy = Math.round(calibrateAccuracy(gameAccuracy(whiteAcc)) * 10) / 10;
  black.accuracy = Math.round(calibrateAccuracy(gameAccuracy(blackAcc)) * 10) / 10;
  white.estRating = white.moveCount > 0 ? estimateRating(white.accuracy) : 0;
  black.estRating = black.moveCount > 0 ? estimateRating(black.accuracy) : 0;

  const graph = positions.map((p) => clamp(p.cp, -GRAPH_CLAMP, GRAPH_CLAMP));

  return { white, black, graph };
}
