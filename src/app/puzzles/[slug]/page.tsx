import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tierFor, puzzleDisplayName } from "@/lib/puzzles";
import { PuzzleSolver } from "@/components/puzzles/puzzle-solver";
import { TierStars } from "@/components/puzzles/tier-stars";
import { GuestSolveMerger } from "@/components/puzzles/guest-solve-merger";
import { SITE_URL } from "@/lib/site";

interface Props {
  params: Promise<{ slug: string }>;
}

async function getPuzzle(slug: string) {
  return prisma.puzzle.findFirst({
    where: { slug, published: true },
    select: {
      id: true,
      slug: true,
      fen: true,
      solution: true,
      sideToMove: true,
      setupFen: true,
      setupMove: true,
      difficulty: true,
      orderIndex: true,
      title: true,
      theme: true,
    },
  });
}

/**
 * The 1-based position of a puzzle within its published tier. Used for the display
 * name so it stays gap-free after a deletion (which leaves a hole in orderIndex)
 * and matches the number on the ladder tile.
 */
async function puzzlePosition(difficulty: number, orderIndex: number) {
  return prisma.puzzle.count({
    where: { published: true, difficulty, orderIndex: { lte: orderIndex } },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const puzzle = await getPuzzle(slug);
  if (!puzzle) return { title: "Puzzle not found" };

  const tier = tierFor(puzzle.difficulty);
  const moves = Math.ceil(puzzle.solution.length / 2);
  const side = puzzle.sideToMove === "b" ? "Black" : "White";
  const position = await puzzlePosition(puzzle.difficulty, puzzle.orderIndex);
  const name = puzzleDisplayName(puzzle.difficulty, position, puzzle.title);

  return {
    title: `${name}: ${side} to Play and Win (${moves}-Move Chess Puzzle)`,
    description: `${side} to move. Find the ${moves === 1 ? "winning move" : `${moves}-move winning line`} in this ${tier?.name.toLowerCase() ?? ""} tactics puzzle. Free to solve, no account needed.`,
    alternates: { canonical: `${SITE_URL}/puzzles/${puzzle.slug}` },
  };
}

export default async function PuzzlePage({ params }: Props) {
  const { slug } = await params;
  const [puzzle, session] = await Promise.all([getPuzzle(slug), auth()]);
  if (!puzzle) notFound();

  const userId = session?.user?.id;

  // The neighbouring puzzles in the same tier, for prev/next navigation.
  const [prev, next, solve, position] = await Promise.all([
    prisma.puzzle.findFirst({
      where: {
        published: true,
        difficulty: puzzle.difficulty,
        orderIndex: { lt: puzzle.orderIndex },
      },
      orderBy: { orderIndex: "desc" },
      select: { slug: true },
    }),
    prisma.puzzle.findFirst({
      where: {
        published: true,
        difficulty: puzzle.difficulty,
        orderIndex: { gt: puzzle.orderIndex },
      },
      orderBy: { orderIndex: "asc" },
      select: { slug: true },
    }),
    userId
      ? prisma.puzzleSolve.findUnique({
          where: { userId_puzzleId: { userId, puzzleId: puzzle.id } },
          select: { id: true },
        })
      : Promise.resolve(null),
    puzzlePosition(puzzle.difficulty, puzzle.orderIndex),
  ]);

  const tier = tierFor(puzzle.difficulty);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      {userId && <GuestSolveMerger />}

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/puzzles"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
          >
            <ChevronLeft className="h-4 w-4 mr-0.5" />
            All puzzles
          </Link>
          {/* Prev/next puzzle jumps, always available so it is easy to step back
              after moving on. Disabled at the ends of a tier. */}
          <div className="flex items-center gap-1 text-sm">
            {prev ? (
              <Link
                href={`/puzzles/${prev.slug}`}
                className="inline-flex items-center rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4 mr-0.5" />
                Prev
              </Link>
            ) : (
              <span className="inline-flex items-center px-2 py-1 text-muted-foreground/40">
                <ChevronLeft className="h-4 w-4 mr-0.5" />
                Prev
              </span>
            )}
            {next ? (
              <Link
                href={`/puzzles/${next.slug}`}
                className="inline-flex items-center rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-0.5" />
              </Link>
            ) : (
              <span className="inline-flex items-center px-2 py-1 text-muted-foreground/40">
                Next
                <ChevronRight className="h-4 w-4 ml-0.5" />
              </span>
            )}
          </div>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {puzzleDisplayName(puzzle.difficulty, position, puzzle.title)}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <TierStars difficulty={puzzle.difficulty} />
          {tier && <span>{tier.name}</span>}
        </div>
      </div>

      <PuzzleSolver
        puzzle={{
          id: puzzle.id,
          fen: puzzle.fen,
          solution: puzzle.solution,
          sideToMove: puzzle.sideToMove,
          setupFen: puzzle.setupFen,
          setupMove: puzzle.setupMove,
          difficulty: puzzle.difficulty,
          title: puzzle.title,
        }}
        nextSlug={next?.slug ?? null}
        isLoggedIn={!!userId}
        alreadySolved={!!solve}
      />
    </div>
  );
}
