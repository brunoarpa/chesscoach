"use client";

import { useMemo, useState, useTransition } from "react";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PUZZLE_TIERS, derivePuzzle } from "@/lib/puzzles";
import { createPuzzle, updatePuzzle } from "@/lib/actions/puzzles";
import { toast } from "sonner";

interface Props {
  // Present when editing; absent when adding a new puzzle.
  puzzle?: {
    id: string;
    sourcePgn: string | null;
    solution: string[];
    difficulty: number;
    title: string | null;
    theme: string | null;
    published: boolean;
  };
  onDone?: () => void;
}

export function PuzzleForm({ puzzle, onDone }: Props) {
  const [pgn, setPgn] = useState(puzzle?.sourcePgn ?? "");
  const [plies, setPlies] = useState(String(puzzle?.solution.length ?? 1));
  const [difficulty, setDifficulty] = useState(String(puzzle?.difficulty ?? 1));
  const [title, setTitle] = useState(puzzle?.title ?? "");
  const [theme, setTheme] = useState(puzzle?.theme ?? "");
  const [published, setPublished] = useState(puzzle?.published ?? false);
  const [pending, startTransition] = useTransition();

  // Live preview so the solution length never has to be guessed: paste a game,
  // nudge the number, and watch the start position and line update.
  const preview = useMemo(() => {
    if (!pgn.trim()) return null;
    const n = Number(plies);
    try {
      return { ok: true as const, ...derivePuzzle(pgn, n) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Invalid PGN" };
    }
  }, [pgn, plies]);

  const canSubmit = !!preview?.ok && !pending;

  function submit() {
    if (!preview?.ok) return;
    const input = {
      pgn,
      solutionPlies: Number(plies),
      difficulty: Number(difficulty),
      title,
      theme,
      published,
    };

    startTransition(async () => {
      try {
        if (puzzle) {
          await updatePuzzle(puzzle.id, input);
          toast.success("Puzzle updated");
        } else {
          await createPuzzle(input);
          toast.success("Puzzle added");
          setPgn("");
          setTitle("");
          setTheme("");
          setPlies("1");
        }
        onDone?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the puzzle");
      }
    });
  }

  const solverMoves = preview?.ok ? Math.ceil(preview.solution.length / 2) : 0;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pgn">Game PGN</Label>
          <Textarea
            id="pgn"
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            rows={7}
            placeholder="1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            The full game. The puzzle is taken from the end of it.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="plies">Solution length (half-moves)</Label>
            <Input
              id="plies"
              type="number"
              min={1}
              value={plies}
              onChange={(e) => setPlies(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Counts both sides. A 2-move puzzle with a reply in between is 3.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="difficulty">Tier</Label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              {PUZZLE_TIERS.map((t) => (
                <option key={t.difficulty} value={t.difficulty}>
                  {t.difficulty} - {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Back rank collapse"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="theme">Theme (optional)</Label>
            <Input
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Deflection"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4"
          />
          Published (visible on the public puzzle page)
        </label>

        <Button onClick={submit} disabled={!canSubmit}>
          {pending ? "Saving..." : puzzle ? "Save changes" : "Add puzzle"}
        </Button>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Preview</p>
        {!preview && (
          <p className="text-sm text-muted-foreground">Paste a PGN to see the puzzle position.</p>
        )}
        {preview && !preview.ok && <p className="text-sm text-destructive">{preview.error}</p>}
        {preview?.ok && (
          <>
            <div className="max-w-[340px]">
              <Chessboard
                options={{
                  id: "puzzle-preview",
                  position: preview.fen,
                  boardOrientation: preview.sideToMove === "b" ? "black" : "white",
                  allowDragging: false,
                  allowDrawingArrows: false,
                }}
              />
            </div>
            <div className="text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Solver plays: </span>
                {preview.sideToMove === "b" ? "Black" : "White"}
              </p>
              <p>
                <span className="text-muted-foreground">Line: </span>
                <span className="font-mono">{preview.solution.join(" ")}</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {solverMoves} move{solverMoves === 1 ? "" : "s"} to find
                {preview.solution.length % 2 === 0 &&
                  " - warning: an even length means the puzzle ends on the opponent's move, which is usually wrong"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
