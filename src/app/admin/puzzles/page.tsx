import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PuzzleForm } from "@/components/admin/puzzle-form";
import { PuzzleList } from "@/components/admin/puzzle-list";

export default async function AdminPuzzlesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") redirect("/");

  const puzzles = await prisma.puzzle.findMany({
    orderBy: [{ difficulty: "asc" }, { orderIndex: "asc" }],
    select: {
      id: true,
      slug: true,
      difficulty: true,
      orderIndex: true,
      title: true,
      theme: true,
      solution: true,
      sourcePgn: true,
      published: true,
      _count: { select: { solves: true } },
    },
  });

  return (
    <div className="container max-w-5xl py-8 space-y-8">
      <div className="space-y-1">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
        >
          <ChevronLeft className="h-4 w-4 mr-0.5" />
          Admin
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Puzzles</h1>
        <p className="text-sm text-muted-foreground">
          Paste a game, pick how much of the end is the puzzle, drop it into a tier. Order inside a
          tier is the order solvers work through it.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="font-semibold mb-4">Add a puzzle</h2>
        <PuzzleForm />
      </div>

      <PuzzleList
        puzzles={puzzles.map((p) => ({
          id: p.id,
          slug: p.slug,
          difficulty: p.difficulty,
          orderIndex: p.orderIndex,
          title: p.title,
          theme: p.theme,
          solution: p.solution,
          sourcePgn: p.sourcePgn,
          published: p.published,
          solveCount: p._count.solves,
        }))}
      />
    </div>
  );
}
