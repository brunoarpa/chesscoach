import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tierFor } from "@/lib/puzzles";
import { PuzzleSolver } from "@/components/puzzles/puzzle-solver";
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
      difficulty: true,
      orderIndex: true,
      title: true,
      theme: true,
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const puzzle = await getPuzzle(slug);
  if (!puzzle) return { title: "Puzzle not found" };

  const tier = tierFor(puzzle.difficulty);
  const moves = Math.ceil(puzzle.solution.length / 2);
  const side = puzzle.sideToMove === "b" ? "Black" : "White";
  const name = puzzle.title ?? `${tier?.name ?? "Chess"} puzzle ${puzzle.orderIndex}`;

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

  // The next puzzle in the same tier, for the "Next puzzle" button.
  const [next, solve] = await Promise.all([
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
  ]);

  const tier = tierFor(puzzle.difficulty);

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {userId && <GuestSolveMerger />}

      <div className="space-y-1">
        <Link
          href="/puzzles"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
        >
          <ChevronLeft className="h-4 w-4 mr-0.5" />
          All puzzles
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {puzzle.title ?? `${tier?.name ?? "Puzzle"} ${puzzle.orderIndex}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tier ? `${tier.name} (${puzzle.difficulty}/5)` : `Difficulty ${puzzle.difficulty}/5`}
          {puzzle.theme ? ` - ${puzzle.theme}` : ""}
        </p>
      </div>

      <PuzzleSolver
        puzzle={{
          id: puzzle.id,
          fen: puzzle.fen,
          solution: puzzle.solution,
          sideToMove: puzzle.sideToMove,
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
