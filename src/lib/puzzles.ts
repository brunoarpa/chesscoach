import { Chess } from "chess.js";

// The five difficulty tiers. All are open from the start: a strong solver should
// be able to jump straight to 5 stars. The sequence lives *inside* a tier, where
// puzzle N+1 unlocks only once N is solved.
export const PUZZLE_TIERS = [
  { difficulty: 1, name: "Warm-up", blurb: "One-move tactics. Spot the pattern and play it." },
  { difficulty: 2, name: "Sharp", blurb: "Short forcing lines where the first move is not the obvious one." },
  { difficulty: 3, name: "Tricky", blurb: "Quiet moves and in-between shots. Calculation starts to matter." },
  { difficulty: 4, name: "Brutal", blurb: "Deep lines with real defensive resources to work around." },
  { difficulty: 5, name: "Brilliant", blurb: "Sacrifices a strong engine has to think about. Master-level finds." },
] as const;

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 5;

export type PuzzleTier = (typeof PUZZLE_TIERS)[number];

export function tierFor(difficulty: number): PuzzleTier | undefined {
  return PUZZLE_TIERS.find((t) => t.difficulty === difficulty);
}

export interface DerivedPuzzle {
  fen: string;
  solution: string[];
  sideToMove: "w" | "b";
  // The opponent move that leads into the puzzle, and the position it is played
  // from. Null when the solution starts at the very first ply of the game.
  setupFen: string | null;
  setupMove: string | null;
}

/**
 * Turn a full game PGN into a puzzle by taking its last `solutionPlies`
 * half-moves as the solution and the position just before them as the start.
 *
 * Plies, not "moves": a 3-move puzzle where the opponent replies in between is 5
 * plies (solver, opponent, solver, opponent, solver). The admin form previews the
 * derived line on a board so the count never has to be guessed.
 *
 * Even indices of `solution` are the solver's moves, odd indices the replies the
 * board plays automatically, which is why a solution should normally have an odd
 * length: it starts and ends with the solver.
 */
export function derivePuzzle(pgn: string, solutionPlies: number): DerivedPuzzle {
  if (!Number.isInteger(solutionPlies) || solutionPlies < 1) {
    throw new Error("Solution length must be a whole number of at least 1");
  }

  const game = new Chess();
  try {
    game.loadPgn(pgn);
  } catch {
    throw new Error("Could not read that PGN");
  }

  const history = game.history({ verbose: true });
  if (history.length === 0) {
    throw new Error("That PGN has no moves in it");
  }
  if (solutionPlies > history.length) {
    throw new Error(
      `The game is only ${history.length} half-moves long, so the solution cannot be ${solutionPlies}`,
    );
  }

  // Replay from the start rather than trusting a FEN header, so the puzzle
  // position is always reachable and legal.
  const startIdx = history.length - solutionPlies;
  const replay = new Chess();
  for (let i = 0; i < startIdx; i++) {
    replay.move(history[i].san);
  }

  // Back up one further ply, if there is one, to capture the opponent move that
  // sets the puzzle up. Puzzle convention (lichess, chess.com) is to play that
  // move for the solver on load so they see what just happened.
  let setupFen: string | null = null;
  let setupMove: string | null = null;
  if (startIdx > 0) {
    const before = new Chess();
    for (let i = 0; i < startIdx - 1; i++) {
      before.move(history[i].san);
    }
    setupFen = before.fen();
    setupMove = history[startIdx - 1].san;
  }

  return {
    fen: replay.fen(),
    solution: history.slice(startIdx).map((m) => m.san),
    sideToMove: replay.turn(),
    setupFen,
    setupMove,
  };
}

/**
 * Check a solver's move against the expected ply. Compared in SAN after being
 * normalised through chess.js, so "Qxf7#" and a drag that produces the same move
 * both match regardless of how the input spelled it.
 */
export function isCorrectMove(fen: string, playedSan: string, expectedSan: string): boolean {
  const board = new Chess(fen);
  let played;
  try {
    played = board.move(playedSan);
  } catch {
    return false;
  }
  if (!played) return false;

  const expectedBoard = new Chess(fen);
  let expected;
  try {
    expected = expectedBoard.move(expectedSan);
  } catch {
    return false;
  }

  return !!expected && played.san === expected.san;
}

/**
 * A URL slug for a puzzle, e.g. "3-12-back-rank". Kept readable for SEO since
 * every puzzle page is indexable and is meant to pull in search traffic.
 */
export function puzzleSlug(difficulty: number, orderIndex: number, title?: string | null): string {
  const base = `${difficulty}-${orderIndex}`;
  const words = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join("-");
  return words ? `${base}-${words}` : base;
}

/**
 * Given every published puzzle in a tier (ordered) and the ids the user has
 * solved, work out how far down the ladder they are allowed. Everything up to and
 * including the first unsolved puzzle is playable; the rest is locked.
 */
export function unlockedCount(orderedIds: string[], solvedIds: Set<string>): number {
  let i = 0;
  while (i < orderedIds.length && solvedIds.has(orderedIds[i])) i++;
  // The first unsolved puzzle is itself playable, hence +1 (capped at the tier).
  return Math.min(i + 1, orderedIds.length);
}
