"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import {
  Chessboard,
  type PieceDropHandlerArgs,
  type SquareHandlerArgs,
} from "react-chessboard";
import { Button } from "@/components/ui/button";
import { MOVE_CLASS_STYLE } from "@/components/lesson/move-class-style";
import { recordSolve } from "@/lib/actions/puzzles";
import { isCorrectMove } from "@/lib/puzzles";
import { addGuestSolve } from "@/lib/puzzle-progress";
import { ArrowRight, Check, Eye, RotateCcw, Search, X } from "lucide-react";

// How long the opponent's reply waits before it plays, so the solver can see
// their own move land before the position changes under them.
const REPLY_DELAY_MS = 450;
// How long a wrong move stays on the board before it is taken back.
const WRONG_MOVE_MS = 550;

const BRILLIANT = MOVE_CLASS_STYLE.brilliant.badge;
const BLUNDER = MOVE_CLASS_STYLE.blunder.badge;

type Status = "solving" | "wrong" | "solved" | "revealed";

interface Props {
  puzzle: {
    id: string;
    fen: string;
    solution: string[];
    sideToMove: string;
    difficulty: number;
    title: string | null;
  };
  nextSlug: string | null;
  isLoggedIn: boolean;
  alreadySolved: boolean;
}

export function PuzzleSolver({ puzzle, nextSlug, isLoggedIn, alreadySolved }: Props) {
  const router = useRouter();

  // `ply` is how far into the solution we are. Even values are the solver's turn.
  const [ply, setPly] = useState(0);
  const [position, setPosition] = useState(puzzle.fen);
  const [status, setStatus] = useState<Status>("solving");
  const [attempts, setAttempts] = useState(1);
  const [wrongSquares, setWrongSquares] = useState<Record<string, React.CSSProperties>>({});
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  // Origin square of a click-to-move in progress.
  const [selected, setSelected] = useState<string | null>(null);
  // A solve only counts if the answer was never revealed. Deliberately sticky
  // across Replay: once you have seen the line, replaying it is not a solve.
  const [usedHelp, setUsedHelp] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear pending replies/take-backs on unmount so a fast navigation cannot set
  // state on a dead component.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  }, []);

  const orientation = puzzle.sideToMove === "b" ? "black" : "white";
  const solverToMove = status === "solving" && ply % 2 === 0;

  // Rebuild the game state for the current ply. Cheap (a handful of moves) and
  // avoids holding a mutable Chess instance in state.
  const gameAt = useCallback(
    (upTo: number) => {
      const g = new Chess(puzzle.fen);
      for (let i = 0; i < upTo; i++) g.move(puzzle.solution[i]);
      return g;
    },
    [puzzle.fen, puzzle.solution],
  );

  const finish = useCallback(async () => {
    setStatus("solved");
    if (usedHelp) return;

    if (isLoggedIn) {
      try {
        await recordSolve(puzzle.id, attempts);
        router.refresh();
      } catch {
        // A failed save should not break the celebration; the user can re-solve.
      }
    } else {
      addGuestSolve(puzzle.id);
    }
  }, [attempts, isLoggedIn, puzzle.id, router, usedHelp]);

  const advance = useCallback(
    (fromPly: number) => {
      const next = fromPly + 1;
      // Solution exhausted: the last ply is always the solver's.
      if (next >= puzzle.solution.length) {
        setPly(next);
        void finish();
        return;
      }

      // Play the opponent's reply, then hand the board back.
      later(() => {
        const g = gameAt(next);
        const replied = g.move(puzzle.solution[next]);
        setPosition(g.fen());
        if (replied) setLastMove({ from: replied.from, to: replied.to });
        const after = next + 1;
        setPly(after);
        if (after >= puzzle.solution.length) void finish();
      }, REPLY_DELAY_MS);

      setPly(next);
    },
    [finish, gameAt, later, puzzle.solution],
  );

  // Shared by dragging and click-to-move, so both input styles behave identically.
  const attemptMove = useCallback(
    (sourceSquare: string, targetSquare: string | null) => {
      if (!targetSquare || !solverToMove) return false;

      const expected = puzzle.solution[ply];
      const game = gameAt(ply);
      const baseFen = game.fen();

      // Take the promotion piece from the expected move so underpromotion puzzles
      // work; anything else defaults to a queen.
      const promotionMatch = expected.match(/=([QRBN])/);
      const promotion = (promotionMatch?.[1] ?? "Q").toLowerCase();

      let played;
      try {
        played = game.move({ from: sourceSquare, to: targetSquare, promotion });
      } catch {
        return false;
      }
      if (!played) return false;

      if (isCorrectMove(baseFen, played.san, expected)) {
        setPosition(game.fen());
        setLastMove({ from: played.from, to: played.to });
        setStatus("solving");
        setWrongSquares({});
        advance(ply);
        return true;
      }

      // Wrong: show it briefly in blunder red, then take it back.
      setPosition(game.fen());
      setStatus("wrong");
      setAttempts((a) => a + 1);
      setWrongSquares({
        [targetSquare]: { backgroundColor: MOVE_CLASS_STYLE.blunder.tint },
      });
      later(() => {
        setPosition(gameAt(ply).fen());
        setWrongSquares({});
        setStatus("solving");
      }, WRONG_MOVE_MS);
      return true;
    },
    [advance, gameAt, later, ply, puzzle.solution, solverToMove],
  );

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
      setSelected(null);
      return attemptMove(sourceSquare, targetSquare);
    },
    [attemptMove],
  );

  // Click-to-move: tap a piece, tap where it goes. What most people expect from
  // chess.com and lichess, and the only workable input on a phone.
  const onSquareClick = useCallback(
    ({ square, piece }: SquareHandlerArgs) => {
      if (!solverToMove) return;

      if (selected === square) {
        setSelected(null);
        return;
      }

      if (selected) {
        const moved = attemptMove(selected, square);
        // Missing the target with another of your own pieces re-aims rather than
        // burning an attempt.
        setSelected(moved ? null : piece ? square : null);
        return;
      }

      // Only your own pieces can start a move.
      const turn = gameAt(ply).turn();
      if (piece && piece.pieceType[0] === turn) setSelected(square);
    },
    [attemptMove, gameAt, ply, selected, solverToMove],
  );

  const reset = useCallback(() => {
    setSelected(null);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPly(0);
    setPosition(puzzle.fen);
    setStatus("solving");
    setWrongSquares({});
    setLastMove(null);
  }, [puzzle.fen]);

  const reveal = useCallback(() => {
    setUsedHelp(true);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const g = gameAt(puzzle.solution.length);
    setPosition(g.fen());
    setPly(puzzle.solution.length);
    setStatus("revealed");
    setWrongSquares({});
    const history = g.history({ verbose: true });
    const final = history[history.length - 1];
    if (final) setLastMove({ from: final.from, to: final.to });
  }, [gameAt, puzzle.solution.length]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      const tint =
        status === "solved" || status === "revealed"
          ? MOVE_CLASS_STYLE.brilliant.tint
          : "rgba(255, 213, 79, 0.42)";
      styles[lastMove.from] = { backgroundColor: tint };
      styles[lastMove.to] = { backgroundColor: tint };
    }
    if (selected) {
      styles[selected] = { backgroundColor: "rgba(56, 189, 248, 0.45)" };
    }
    return { ...styles, ...wrongSquares };
  }, [lastMove, selected, status, wrongSquares]);

  // Which of the solver's moves they are on, for "Move 2 of 3".
  const solverMoves = Math.ceil(puzzle.solution.length / 2);
  const currentSolverMove = Math.min(Math.floor(ply / 2) + 1, solverMoves);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="mx-auto w-full max-w-[560px]">
        <Chessboard
          options={{
            id: "puzzle-board",
            position,
            onPieceDrop,
            onSquareClick,
            boardOrientation: orientation,
            squareStyles,
            allowDragging: solverToMove,
            allowDrawingArrows: true,
            animationDurationInMs: 200,
          }}
        />
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {orientation === "white" ? "White" : "Black"} to play
            </p>
            {solverMoves > 1 && status !== "solved" && status !== "revealed" && (
              <p className="text-xs text-muted-foreground">
                Move {currentSolverMove} of {solverMoves}
              </p>
            )}
          </div>

          {status === "solving" && (
            <p className="text-sm text-muted-foreground">
              {solverMoves > 1
                ? "Find the whole line. Each correct move gets a reply."
                : "Find the move."}
            </p>
          )}

          {status === "wrong" && (
            <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: BLUNDER }}>
              <X className="h-4 w-4" />
              Not that one. Try again.
            </p>
          )}

          {status === "solved" && (
            <div className="space-y-2">
              <p
                className="text-sm font-semibold flex items-center gap-1.5"
                style={{ color: BRILLIANT }}
              >
                <Check className="h-4 w-4" />
                {attempts === 1 ? "Solved, first try." : "Solved."}
              </p>
              {!isLoggedIn && !usedHelp && (
                <p className="text-xs text-muted-foreground">
                  Saved for this visit only. Make an account to keep it.
                </p>
              )}
              {alreadySolved && (
                <p className="text-xs text-muted-foreground">You had already solved this one.</p>
              )}
            </div>
          )}

          {status === "revealed" && (
            <p className="text-sm text-muted-foreground">
              This is the answer. Solve it yourself to tick it off.
            </p>
          )}

          <div className="text-xs text-muted-foreground">
            Solution:{" "}
            {status === "solved" || status === "revealed" ? (
              <span className="font-mono">{puzzle.solution.join(" ")}</span>
            ) : (
              <span>{puzzle.solution.length} half-moves</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {status === "solved" || status === "revealed" ? "Replay" : "Restart"}
            </Button>
            {status !== "solved" && status !== "revealed" && (
              <Button size="sm" variant="ghost" onClick={reveal}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Show answer
              </Button>
            )}
            {nextSlug && (status === "solved" || status === "revealed") && (
              <Button size="sm" asChild>
                <Link href={`/puzzles/${nextSlug}`}>
                  Next puzzle
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {status === "solved" && !isLoggedIn && (
          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold text-sm">Keep your progress</h2>
            <p className="text-xs text-muted-foreground">
              Your solves disappear when you close the tab. An account keeps the ladder, on any
              device.
            </p>
            <Button asChild size="sm" className="w-full">
              <Link href="/signup?callbackUrl=/puzzles">Create a free account</Link>
            </Button>
          </div>
        )}

        {(status === "revealed" || (status === "solved" && attempts > 2)) && (
          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold text-sm">Tactics keep costing you games?</h2>
            <p className="text-xs text-muted-foreground">
              A coach can find the pattern you keep missing and drill it with you on a live board.
              Your first lesson is free.
            </p>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href="/search">
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Find a coach
              </Link>
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
