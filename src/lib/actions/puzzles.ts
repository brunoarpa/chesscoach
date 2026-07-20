"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  derivePuzzle,
  puzzleSlug,
  MIN_DIFFICULTY,
  MAX_DIFFICULTY,
} from "@/lib/puzzles";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") throw new Error("Not authorized");
  return session.user.id;
}

function revalidatePuzzles(slug?: string) {
  revalidatePath("/puzzles");
  revalidatePath("/admin/puzzles");
  if (slug) revalidatePath(`/puzzles/${slug}`);
}

export interface PuzzleInput {
  pgn: string;
  solutionPlies: number;
  difficulty: number;
  title?: string;
  theme?: string;
  published?: boolean;
}

function validate(input: PuzzleInput) {
  const difficulty = Number(input.difficulty);
  if (
    !Number.isInteger(difficulty) ||
    difficulty < MIN_DIFFICULTY ||
    difficulty > MAX_DIFFICULTY
  ) {
    throw new Error(`Difficulty must be a whole number from ${MIN_DIFFICULTY} to ${MAX_DIFFICULTY}`);
  }

  // Re-derive server-side from the PGN rather than trusting whatever the form
  // computed, so the stored position and solution always match the source game.
  const derived = derivePuzzle(input.pgn, Number(input.solutionPlies));
  return { difficulty, derived };
}

/**
 * Make `slug` unique by suffixing -2, -3, ... if it is already taken. Only used at
 * creation: an existing puzzle keeps its slug for the life of the puzzle.
 */
async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; ; n++) {
    const clash = await prisma.puzzle.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${n}`;
  }
}

export async function createPuzzle(input: PuzzleInput) {
  await requireAdmin();
  const { difficulty, derived } = validate(input);

  // Append to the end of its tier.
  const last = await prisma.puzzle.findFirst({
    where: { difficulty },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  const orderIndex = (last?.orderIndex ?? 0) + 1;

  const slug = await uniqueSlug(puzzleSlug(difficulty, orderIndex, input.title));

  const puzzle = await prisma.puzzle.create({
    data: {
      slug,
      difficulty,
      orderIndex,
      fen: derived.fen,
      solution: derived.solution,
      sideToMove: derived.sideToMove,
      setupFen: derived.setupFen,
      setupMove: derived.setupMove,
      title: input.title?.trim() || null,
      theme: input.theme?.trim() || null,
      sourcePgn: input.pgn.trim(),
      published: input.published ?? false,
    },
  });

  revalidatePuzzles(puzzle.slug);
  return puzzle.id;
}

export async function updatePuzzle(id: string, input: PuzzleInput) {
  await requireAdmin();
  const { difficulty, derived } = validate(input);

  const existing = await prisma.puzzle.findUnique({
    where: { id },
    select: { difficulty: true, orderIndex: true },
  });
  if (!existing) throw new Error("Puzzle not found");

  // Moving a puzzle to a different tier appends it to the end of the new one;
  // staying put keeps its position.
  let orderIndex = existing.orderIndex;
  if (difficulty !== existing.difficulty) {
    const last = await prisma.puzzle.findFirst({
      where: { difficulty },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    orderIndex = (last?.orderIndex ?? 0) + 1;
  }

  // The slug is deliberately frozen at creation. It encodes the tier and position,
  // both of which move when puzzles are reordered or retiered, and a puzzle page
  // is an indexable landing page: regenerating the slug would silently change a
  // live URL and drop whatever links and ranking it had.
  const puzzle = await prisma.puzzle.update({
    where: { id },
    data: {
      difficulty,
      orderIndex,
      fen: derived.fen,
      solution: derived.solution,
      sideToMove: derived.sideToMove,
      setupFen: derived.setupFen,
      setupMove: derived.setupMove,
      title: input.title?.trim() || null,
      theme: input.theme?.trim() || null,
      sourcePgn: input.pgn.trim(),
      published: input.published ?? false,
    },
  });

  revalidatePuzzles(puzzle.slug);
}

export async function setPuzzlePublished(id: string, published: boolean) {
  await requireAdmin();
  const puzzle = await prisma.puzzle.update({
    where: { id },
    data: { published },
    select: { slug: true },
  });
  revalidatePuzzles(puzzle.slug);
}

export async function deletePuzzle(id: string) {
  await requireAdmin();
  const puzzle = await prisma.puzzle.delete({ where: { id }, select: { slug: true } });
  revalidatePuzzles(puzzle.slug);
}

/**
 * Swap a puzzle with its neighbour inside the tier. Ladder order is what decides
 * unlocks, so this is how the tier gets sequenced after puzzles are added.
 */
export async function movePuzzle(id: string, direction: "up" | "down") {
  await requireAdmin();

  const puzzle = await prisma.puzzle.findUnique({
    where: { id },
    select: { id: true, difficulty: true, orderIndex: true },
  });
  if (!puzzle) throw new Error("Puzzle not found");

  const neighbour = await prisma.puzzle.findFirst({
    where: {
      difficulty: puzzle.difficulty,
      orderIndex:
        direction === "up" ? { lt: puzzle.orderIndex } : { gt: puzzle.orderIndex },
    },
    orderBy: { orderIndex: direction === "up" ? "desc" : "asc" },
    select: { id: true, orderIndex: true },
  });
  // Already at the end of the tier.
  if (!neighbour) return;

  await prisma.$transaction([
    prisma.puzzle.update({
      where: { id: puzzle.id },
      data: { orderIndex: neighbour.orderIndex },
    }),
    prisma.puzzle.update({
      where: { id: neighbour.id },
      data: { orderIndex: puzzle.orderIndex },
    }),
  ]);

  revalidatePuzzles();
}

/**
 * Record that the signed-in user solved a puzzle. No-op for guests: their
 * progress lives in sessionStorage until they make an account.
 *
 * A solve counts whether or not a hint was used, so it always unlocks the next
 * puzzle and never leaves a gap that would hide the solved puzzles after it. The
 * `usedHint` flag only changes how the tile is tinted; solving the puzzle again
 * cleanly clears it.
 *
 * Deliberately trusts the client's "I solved it". Puzzles award nothing but a
 * tick on a ladder, so validating the move list server-side would cost a request
 * per move to stop cheating that only hurts the cheater.
 */
export async function recordSolve(puzzleId: string, attempts: number, usedHint = false) {
  const session = await auth();
  if (!session?.user?.id) return { saved: false };

  const safeAttempts = Number.isFinite(attempts) ? Math.max(1, Math.floor(attempts)) : 1;

  await prisma.puzzleSolve.upsert({
    where: { userId_puzzleId: { userId: session.user.id, puzzleId } },
    // A clean re-solve claims a previously hinted puzzle (clears the flag); a
    // hinted re-solve leaves an existing solve untouched, so it can only ever
    // upgrade hinted -> clean, never the reverse. The original attempt count stays.
    update: usedHint ? {} : { usedHint: false },
    create: { userId: session.user.id, puzzleId, attempts: safeAttempts, usedHint },
  });

  revalidatePath("/puzzles");
  return { saved: true };
}

/**
 * Claim puzzles solved as a guest earlier in this browser session. Called once
 * after signup/login so the ladder a visitor built before making an account does
 * not reset under them.
 */
export async function mergeGuestSolves(puzzleIds: string[], hintedIds: string[] = []) {
  const session = await auth();
  if (!session?.user?.id) return { merged: 0 };
  if (!Array.isArray(puzzleIds) || puzzleIds.length === 0) return { merged: 0 };

  // Cap the batch and drop unknown ids so a tampered sessionStorage payload
  // cannot mass-insert rows.
  const ids = [...new Set(puzzleIds.filter((id) => typeof id === "string"))].slice(0, 500);
  const hinted = new Set(
    (Array.isArray(hintedIds) ? hintedIds : []).filter((id) => typeof id === "string"),
  );
  const known = await prisma.puzzle.findMany({
    where: { id: { in: ids }, published: true },
    select: { id: true },
  });

  const result = await prisma.puzzleSolve.createMany({
    data: known.map((p) => ({
      userId: session.user!.id!,
      puzzleId: p.id,
      usedHint: hinted.has(p.id),
    })),
    skipDuplicates: true,
  });

  revalidatePath("/puzzles");
  return { merged: result.count };
}
