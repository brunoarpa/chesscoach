"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PuzzleForm } from "@/components/admin/puzzle-form";
import { PUZZLE_TIERS } from "@/lib/puzzles";
import { deletePuzzle, movePuzzle, setPuzzlePublished } from "@/lib/actions/puzzles";
import { toast } from "sonner";

export interface AdminPuzzle {
  id: string;
  slug: string;
  difficulty: number;
  orderIndex: number;
  title: string | null;
  theme: string | null;
  solution: string[];
  sourcePgn: string | null;
  published: boolean;
  solveCount: number;
}

export function PuzzleList({ puzzles }: { puzzles: AdminPuzzle[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-8">
      {PUZZLE_TIERS.map((tier) => {
        const tierPuzzles = puzzles
          .filter((p) => p.difficulty === tier.difficulty)
          .sort((a, b) => a.orderIndex - b.orderIndex);

        return (
          <section key={tier.difficulty} className="space-y-2">
            <h3 className="font-semibold">
              {tier.difficulty} - {tier.name}{" "}
              <span className="text-muted-foreground font-normal text-sm">
                ({tierPuzzles.length})
              </span>
            </h3>

            {tierPuzzles.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing in this tier yet.</p>
            )}

            {tierPuzzles.map((puzzle, i) => (
              <div key={puzzle.id} className="rounded-md border">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <span className="text-sm font-mono text-muted-foreground w-6">{i + 1}</span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {puzzle.title ?? <span className="text-muted-foreground">Untitled</span>}
                      {puzzle.theme && (
                        <span className="text-muted-foreground font-normal"> - {puzzle.theme}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {puzzle.solution.join(" ")}
                    </p>
                  </div>

                  <Badge variant={puzzle.published ? "default" : "secondary"}>
                    {puzzle.published ? "Live" : "Draft"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {puzzle.solveCount} solve{puzzle.solveCount === 1 ? "" : "s"}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending || i === 0}
                      onClick={() => run(() => movePuzzle(puzzle.id, "up"), "Moved up")}
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending || i === tierPuzzles.length - 1}
                      onClick={() => run(() => movePuzzle(puzzle.id, "down"), "Moved down")}
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      asChild
                      title="Open the public page"
                    >
                      <Link href={`/puzzles/${puzzle.slug}`} target="_blank">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(editing === puzzle.id ? null : puzzle.id)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setPuzzlePublished(puzzle.id, !puzzle.published),
                          puzzle.published ? "Unpublished" : "Published",
                        )
                      }
                    >
                      {puzzle.published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm("Delete this puzzle? Solves for it go too.")) return;
                        run(() => deletePuzzle(puzzle.id), "Puzzle deleted");
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {editing === puzzle.id && (
                  <div className="border-t p-4">
                    <PuzzleForm
                      puzzle={puzzle}
                      onDone={() => {
                        setEditing(null);
                        router.refresh();
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
