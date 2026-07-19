"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chess, type Square } from "chess.js";
import {
  Chessboard,
  type PieceDropHandlerArgs,
  type SquareHandlerArgs,
} from "react-chessboard";
import { Button } from "@/components/ui/button";
import { MOVE_CLASS_STYLE } from "@/components/lesson/move-class-style";
import { recordSolve } from "@/lib/actions/puzzles";
import { addGuestSolve } from "@/lib/puzzle-progress";
import { isCorrectMove } from "@/lib/puzzles";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
  Search,
  Undo2,
  X,
} from "lucide-react";

// Same tints the lesson/review board uses, so a puzzle looks and behaves like the
// board people already know from the game review.
const LAST_MOVE_TINT = "rgba(255,213,0,0.42)";
const SELECTED_TINT = "rgba(255, 255, 0, 0.4)";
const RIGHT_CLICK_TINT = "rgba(235, 97, 80, 0.8)";
// Right and wrong read off the board instantly, before anyone reads the sidebar:
// your correct moves land green, a wrong one lands red and stays there.
const CORRECT_TINT = MOVE_CLASS_STYLE.best.tint;
const WRONG_TINT = MOVE_CLASS_STYLE.blunder.tint;
const CORRECT_COLOR = MOVE_CLASS_STYLE.best.badge;
const WRONG_COLOR = MOVE_CLASS_STYLE.blunder.badge;

// The opponent's setup move waits a beat on load so it reads as a move being
// played rather than the starting position.
const SETUP_DELAY_MS = 600;
// How long the opponent's reply waits, so your own move lands visibly first.
const REPLY_DELAY_MS = 450;

type Status = "solving" | "wrong" | "solved";

interface Props {
  puzzle: {
    id: string;
    fen: string;
    solution: string[];
    sideToMove: string;
    setupFen: string | null;
    setupMove: string | null;
    difficulty: number;
    title: string | null;
  };
  nextSlug: string | null;
  isLoggedIn: boolean;
  alreadySolved: boolean;
}

export function PuzzleSolver({ puzzle, nextSlug, isLoggedIn, alreadySolved }: Props) {
  const router = useRouter();

  const hasSetup = !!(puzzle.setupFen && puzzle.setupMove);
  // Everything replays from here, so any position is reconstructible and we never
  // hold a mutable Chess instance in state.
  const baseFen = hasSetup ? puzzle.setupFen! : puzzle.fen;

  const [setupDone, setSetupDone] = useState(!hasSetup);
  // How many plies of the solution are on the board.
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status>("solving");
  const [attempts, setAttempts] = useState(1);
  const [usedHelp, setUsedHelp] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [highlighted, setHighlighted] = useState<Record<string, React.CSSProperties>>({});
  // A wrong move is shown briefly before being taken back; this holds it.
  const [wrongMove, setWrongMove] = useState<{ san: string; to: string } | null>(null);
  // How far back the user has stepped. null means "following the live position".
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const rightClickStart = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  // Play the opponent's setup move shortly after mount.
  useEffect(() => {
    if (!hasSetup || setupDone) return;
    const t = setTimeout(() => setSetupDone(true), SETUP_DELAY_MS);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [hasSetup, setupDone]);

  // Every ply currently on the board, oldest first. `kind` drives the square tint,
  // so a correct move is green the instant it lands and a wrong one is red.
  const plies = useMemo(() => {
    const list: { san: string; kind: "setup" | "solver" | "opponent" | "wrong" }[] = [];
    if (hasSetup && setupDone) list.push({ san: puzzle.setupMove!, kind: "setup" });
    puzzle.solution.slice(0, progress).forEach((san, i) => {
      list.push({ san, kind: i % 2 === 0 ? "solver" : "opponent" });
    });
    if (wrongMove) list.push({ san: wrongMove.san, kind: "wrong" });
    return list;
  }, [hasSetup, setupDone, puzzle.setupMove, puzzle.solution, progress, wrongMove]);

  const shownCount = viewIndex ?? plies.length;
  const atLive = shownCount === plies.length;

  // The game as currently displayed.
  const game = useMemo(() => {
    const g = new Chess(baseFen);
    for (let i = 0; i < shownCount; i++) g.move(plies[i].san);
    return g;
  }, [baseFen, plies, shownCount]);

  // Squares tinted by what happened on them. Your latest correct move stays green
  // even after the opponent answers, so the "that was right" signal is not wiped
  // half a second later by their reply.
  const moveHighlights = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (shownCount === 0) return styles;

    const verbose = game.history({ verbose: true });
    const paint = (i: number, tint: string) => {
      const m = verbose[i];
      if (!m) return;
      styles[m.from as string] = { backgroundColor: tint };
      styles[m.to as string] = { backgroundColor: tint };
    };

    // Your most recent correct move, green.
    for (let i = shownCount - 1; i >= 0; i--) {
      if (plies[i].kind === "solver") {
        paint(i, CORRECT_TINT);
        break;
      }
    }

    // Then whatever actually moved last, so the board still reads "this just
    // happened". A wrong move is red; the opponent's is the neutral yellow.
    const lastKind = plies[shownCount - 1].kind;
    if (lastKind === "wrong") paint(shownCount - 1, WRONG_TINT);
    else if (lastKind !== "solver") paint(shownCount - 1, LAST_MOVE_TINT);

    return styles;
  }, [game, plies, shownCount]);

  const solverToMove =
    atLive && setupDone && !wrongMove && status !== "solved" && progress % 2 === 0;

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

  // Advance past the solver's move at `from`, auto-playing the opponent's reply.
  const advance = useCallback(
    (from: number) => {
      const next = from + 1;
      setProgress(next);

      if (next >= puzzle.solution.length) {
        void finish();
        return;
      }

      later(() => {
        const after = next + 1;
        setProgress(after);
        if (after >= puzzle.solution.length) void finish();
      }, REPLY_DELAY_MS);
    },
    [finish, later, puzzle.solution.length],
  );

  const legalTargets = useMemo(
    () => (selected ? game.moves({ square: selected, verbose: true }).map((m) => m.to) : []),
    [game, selected],
  );

  const attemptMove = useCallback(
    (from: string, to: string) => {
      if (!solverToMove) return false;

      const expected = puzzle.solution[progress];
      const board = new Chess(game.fen());

      // Take the promotion piece from the expected move so underpromotion puzzles
      // work; anything else defaults to a queen.
      const promotion = (expected.match(/=([QRBN])/)?.[1] ?? "Q").toLowerCase();

      let played;
      try {
        played = board.move({ from, to, promotion });
      } catch {
        return false;
      }
      if (!played) return false;

      setSelected(null);
      setHighlighted({});

      if (isCorrectMove(game.fen(), played.san, expected)) {
        setStatus("solving");
        advance(progress);
        return true;
      }

      // Wrong: it stays on the board in red until the solver takes it back
      // themselves, so they can look at the position they actually created
      // instead of having it yanked away.
      setStatus("wrong");
      setAttempts((a) => a + 1);
      setWrongMove({ san: played.san, to: played.to });
      return true;
    },
    [advance, game, progress, puzzle.solution, solverToMove],
  );

  // Undo a wrong move and hand the board back.
  const retract = useCallback(() => {
    setWrongMove(null);
    setStatus("solving");
    setSelected(null);
    setViewIndex(null);
  }, []);

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) =>
      targetSquare ? attemptMove(sourceSquare, targetSquare) : false,
    [attemptMove],
  );

  // Click a piece to see its legal moves, click a target to play it. Mirrors the
  // review board, and is the only workable input on a phone.
  const onSquareClick = useCallback(
    ({ square }: SquareHandlerArgs) => {
      if (Object.keys(highlighted).length > 0) setHighlighted({});
      if (!solverToMove) return;

      if (selected) {
        if (legalTargets.includes(square as Square)) {
          attemptMove(selected, square);
          return;
        }
        if (square === selected) {
          setSelected(null);
          return;
        }
      }

      const piece = game.get(square as Square);
      setSelected(piece && piece.color === game.turn() ? (square as Square) : null);
    },
    [attemptMove, game, highlighted, legalTargets, selected, solverToMove],
  );

  // Right-click paints a square red, same as the review board.
  const onSquareMouseDown = useCallback(({ square }: SquareHandlerArgs, e: React.MouseEvent) => {
    if (e.button === 2) rightClickStart.current = square;
  }, []);

  const onSquareMouseUp = useCallback(({ square }: SquareHandlerArgs, e: React.MouseEvent) => {
    if (e.button !== 2 || !rightClickStart.current) return;
    if (rightClickStart.current === square) {
      setSelected(null);
      setHighlighted((prev) => {
        const copy = { ...prev };
        if (copy[square]) delete copy[square];
        else copy[square] = { backgroundColor: RIGHT_CLICK_TINT };
        return copy;
      });
    }
    rightClickStart.current = null;
  }, []);

  const canBack = shownCount > 0;
  const canForward = !atLive;

  const goBack = useCallback(() => {
    setSelected(null);
    // Stepping back off a wrong move undoes it rather than just previewing the
    // position before it, which is what "go back and try again" means here.
    if (wrongMove && atLive) {
      retract();
      return;
    }
    setViewIndex((v) => Math.max(0, (v ?? plies.length) - 1));
  }, [atLive, plies.length, retract, wrongMove]);

  const goForward = useCallback(() => {
    setSelected(null);
    setViewIndex((v) => {
      if (v === null) return null;
      const next = v + 1;
      return next >= plies.length ? null : next;
    });
  }, [plies.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack, goForward]);

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setProgress(0);
    setStatus("solving");
    setSelected(null);
    setHighlighted({});
    setWrongMove(null);
    setViewIndex(null);
    setSetupDone(!hasSetup);
  }, [hasSetup]);

  // Reveal one move at a time rather than dumping the whole line: the point is to
  // get unstuck on this move, not to be shown the ending.
  const revealNext = useCallback(() => {
    if (!setupDone || progress >= puzzle.solution.length) return;
    setUsedHelp(true);
    setViewIndex(null);
    setSelected(null);
    setWrongMove(null);
    setStatus("solving");
    advance(progress);
  }, [advance, progress, puzzle.solution.length, setupDone]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...moveHighlights };

    if (selected) {
      styles[selected] = { ...styles[selected], backgroundColor: SELECTED_TINT };
      for (const sq of legalTargets) {
        styles[sq] = {
          ...styles[sq],
          background: game.get(sq as Square)
            ? "radial-gradient(circle, transparent 55%, rgba(0, 0, 0, 0.3) 55%)"
            : "radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)",
        };
      }
    }

    // Right-click marks win, so they are always visible.
    return { ...styles, ...highlighted };
  }, [game, highlighted, legalTargets, moveHighlights, selected]);

  const solverMoves = Math.ceil(puzzle.solution.length / 2);
  const currentSolverMove = Math.min(Math.floor(progress / 2) + 1, solverMoves);
  const solved = status === "solved";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="mx-auto w-full max-w-[560px] space-y-3">
        <div onContextMenu={(e) => e.preventDefault()}>
          <Chessboard
            options={{
              id: "puzzle-board",
              position: game.fen(),
              onPieceDrop,
              onSquareClick,
              onSquareMouseDown,
              onSquareMouseUp,
              boardOrientation: puzzle.sideToMove === "b" ? "black" : "white",
              squareStyles,
              allowDragging: solverToMove,
              allowDrawingArrows: true,
              animationDurationInMs: 200,
            }}
          />
        </div>

        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={goBack}
            disabled={!canBack}
            title="Previous move (left arrow)"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={goForward}
            disabled={!canForward}
            title="Next move (right arrow)"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {puzzle.sideToMove === "b" ? "Black" : "White"} to play
            </p>
            {solverMoves > 1 && !solved && (
              <p className="text-xs text-muted-foreground">
                Move {currentSolverMove} of {solverMoves}
              </p>
            )}
          </div>

          {!atLive && (
            <p className="text-sm text-muted-foreground">
              Reviewing an earlier position. Step forward to play on.
            </p>
          )}

          {atLive && status === "solving" && !solved && (
            <p className="text-sm text-muted-foreground">
              {solverMoves > 1
                ? "Find the whole line. Each correct move gets a reply."
                : "Find the move."}
            </p>
          )}

          {atLive && status === "wrong" && (
            <div className="space-y-2">
              <p
                className="text-sm font-semibold flex items-center gap-1.5"
                style={{ color: WRONG_COLOR }}
              >
                <X className="h-4 w-4" />
                Not that one.
              </p>
              <Button size="sm" variant="outline" onClick={retract}>
                <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                Take it back
              </Button>
            </div>
          )}

          {solved && (
            <div className="space-y-2">
              <p
                className="text-base font-bold flex items-center gap-1.5"
                style={{ color: CORRECT_COLOR }}
              >
                <Check className="h-5 w-5" />
                {usedHelp ? "Line complete." : attempts === 1 ? "Solved, first try." : "Solved."}
              </p>
              {usedHelp && (
                <p className="text-xs text-muted-foreground">
                  You used a hint, so this one is not ticked off. Replay it to claim it.
                </p>
              )}
              {!usedHelp && !isLoggedIn && (
                <p className="text-xs text-muted-foreground">
                  Saved for this visit only. Make an account to keep it.
                </p>
              )}
              {!usedHelp && alreadySolved && (
                <p className="text-xs text-muted-foreground">You had already solved this one.</p>
              )}
            </div>
          )}

          {solved && (
            <div className="text-xs text-muted-foreground">
              Solution: <span className="font-mono">{puzzle.solution.join(" ")}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {solved ? "Replay" : "Restart"}
            </Button>
            {!solved && (
              <Button size="sm" variant="ghost" onClick={revealNext} disabled={!setupDone}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Show next move
              </Button>
            )}
            {nextSlug && solved && (
              <Button size="sm" asChild>
                <Link href={`/puzzles/${nextSlug}`}>
                  Next puzzle
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {solved && !usedHelp && !isLoggedIn && (
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

        {(usedHelp || (solved && attempts > 2)) && (
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
