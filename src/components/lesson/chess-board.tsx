"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs, type Arrow, type SquareRenderer } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownUp, FilePlus, Upload, Lightbulb } from "lucide-react";
import { EvalBar, type EngineLine } from "./eval-bar";
import { useBoardSync } from "@/hooks/use-board-sync";

// Move quality classification.
type MoveClass = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

// Per-class presentation: `color`/`bg` are Tailwind classes for the text labels
// in the move list & engine panel; `badge` (solid) and `tint` (translucent) are
// raw CSS colors for the on-board chess.com-style markers.
const MOVE_CLASS_STYLE: Record<MoveClass, { label: string; symbol: string; color: string; bg: string; badge: string; tint: string }> = {
  best:        { label: "Best",       symbol: "★",  color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-950/40", badge: "#81b64c", tint: "rgba(129,182,76,0.45)" },
  excellent:   { label: "Excellent",  symbol: "!",  color: "text-green-700 dark:text-green-300",     bg: "bg-green-100 dark:bg-green-950/40",     badge: "#81b64c", tint: "rgba(129,182,76,0.40)" },
  good:        { label: "Good",       symbol: "✓",  color: "text-lime-700 dark:text-lime-300",       bg: "bg-lime-100 dark:bg-lime-950/40",       badge: "#95b776", tint: "rgba(149,183,118,0.40)" },
  inaccuracy:  { label: "Inaccuracy", symbol: "?!", color: "text-yellow-700 dark:text-yellow-300",   bg: "bg-yellow-100 dark:bg-yellow-950/40",   badge: "#f7c631", tint: "rgba(247,198,49,0.45)" },
  mistake:     { label: "Mistake",    symbol: "?",  color: "text-orange-700 dark:text-orange-300",   bg: "bg-orange-100 dark:bg-orange-950/40",   badge: "#ffa459", tint: "rgba(255,164,89,0.45)" },
  blunder:     { label: "Blunder",    symbol: "??", color: "text-red-700 dark:text-red-300",         bg: "bg-red-100 dark:bg-red-950/40",         badge: "#fa412d", tint: "rgba(250,65,45,0.45)" },
};

// Logistic curve mapping a centipawn eval to "expected points" (win probability,
// 0..1) — the chess.com win-percentage model. The constant is chess.com's.
const WIN_PROB_K = 0.00368208;
function cpToExpectedPoints(cp: number): number {
  return 1 / (1 + Math.exp(-WIN_PROB_K * cp));
}

// Classify by expected points *lost* by the move. Cutoffs match the user's table:
// Best 0, Excellent ≤0.02, Good ≤0.05, Inaccuracy ≤0.10, Mistake ≤0.20, else Blunder.
function classifyByExpectedPointsLost(loss: number): MoveClass {
  if (loss <= 0) return "best";
  if (loss <= 0.02) return "excellent";
  if (loss <= 0.05) return "good";
  if (loss <= 0.10) return "inaccuracy";
  if (loss <= 0.20) return "mistake";
  return "blunder";
}

// Classify a played move from the mover's perspective: how much did the position's
// expected points drop from the best available (before) to the result (after)?
// Both evals are white-perspective centipawns.
function classifyMove(parentBestCp: number, resultCp: number, moverIsWhite: boolean): MoveClass {
  const sign = moverIsWhite ? 1 : -1;
  const epBefore = cpToExpectedPoints(sign * parentBestCp);
  const epAfter = cpToExpectedPoints(sign * resultCp);
  return classifyByExpectedPointsLost(Math.max(0, epBefore - epAfter));
}

function evalToCp(line: { cp: number | null; mate: number | null }): number {
  if (line.mate !== null) return line.mate > 0 ? 100000 : -100000;
  return line.cp ?? 0;
}

interface Props {
  lessonId: string;
  userId: string;
  isCoach: boolean;
  initialBoardPgn?: string;
}

function formatLineEval(line: EngineLine): string {
  if (line.mate !== null) return `${line.mate > 0 ? "+" : "-"}M${Math.abs(line.mate)}`;
  if (line.cp !== null) {
    const v = line.cp / 100;
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  }
  return "—";
}

export function ChessBoard({ lessonId, userId, isCoach, initialBoardPgn }: Props) {
  const [moveHistory, setMoveHistory] = useState<string[]>(() => {
    if (initialBoardPgn) {
      try {
        const g = new Chess();
        g.loadPgn(initialBoardPgn);
        return g.history();
      } catch { return []; }
    }
    return [];
  });
  const [currentMoveIndex, setCurrentMoveIndex] = useState(() => {
    if (initialBoardPgn) {
      try {
        const g = new Chess();
        g.loadPgn(initialBoardPgn);
        return g.history().length - 1;
      } catch { return -1; }
    }
    return -1;
  });
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [highlightedSquares, setHighlightedSquares] = useState<Record<string, React.CSSProperties>>({});
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  // Eval cache: best eval (cp, white perspective) keyed by FEN. Populated as the
  // engine analyzes each position the user visits — feeds move classification.
  const [evalCache, setEvalCache] = useState<Map<string, number>>(new Map());
  const [showEngineArrows, setShowEngineArrows] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [squareSize, setSquareSize] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const rightClickStartRef = useRef<string | null>(null);
  const isRemoteUpdateRef = useRef(false);

  // ---- Board Sync ----
  const onRemoteMoves = useCallback((remoteMoves: string[], remoteIndex: number) => {
    isRemoteUpdateRef.current = true;
    setMoveHistory(remoteMoves);
    setCurrentMoveIndex(remoteIndex);
    setSelectedSquare(null);
    isRemoteUpdateRef.current = false;
  }, []);

  const onRemoteNavigate = useCallback((remoteIndex: number) => {
    isRemoteUpdateRef.current = true;
    setCurrentMoveIndex(remoteIndex);
    setSelectedSquare(null);
    isRemoteUpdateRef.current = false;
  }, []);

  const onRemoteArrows = useCallback((remoteArrows: Arrow[]) => {
    isRemoteUpdateRef.current = true;
    setArrows(remoteArrows);
    isRemoteUpdateRef.current = false;
  }, []);

  const onRemoteHighlights = useCallback((remoteHighlights: Record<string, React.CSSProperties>) => {
    isRemoteUpdateRef.current = true;
    setHighlightedSquares(remoteHighlights);
    isRemoteUpdateRef.current = false;
  }, []);

  const onRemoteReset = useCallback(() => {
    isRemoteUpdateRef.current = true;
    setMoveHistory([]);
    setCurrentMoveIndex(-1);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});
    isRemoteUpdateRef.current = false;
  }, []);

  const {
    broadcastMoves,
    broadcastNavigate,
    broadcastArrows,
    broadcastHighlights,
    broadcastReset,
  } = useBoardSync({
    lessonId,
    userId,
    onRemoteMoves,
    onRemoteNavigate,
    onRemoteArrows,
    onRemoteHighlights,
    onRemoteReset,
  });

  const getGameAtIndex = useCallback((moves: string[], index: number) => {
    const g = new Chess();
    for (let i = 0; i <= index && i < moves.length; i++) {
      g.move(moves[i]);
    }
    return g;
  }, []);

  const game = getGameAtIndex(moveHistory, currentMoveIndex);

  const legalMoveSquares = selectedSquare
    ? game.moves({ square: selectedSquare, verbose: true }).map((m) => m.to)
    : [];

  const squareStyles: Record<string, React.CSSProperties> = { ...highlightedSquares };

  if (selectedSquare) {
    squareStyles[selectedSquare] = {
      ...squareStyles[selectedSquare],
      backgroundColor: "rgba(255, 255, 0, 0.4)",
    };
    for (const sq of legalMoveSquares) {
      squareStyles[sq] = {
        ...squareStyles[sq],
        background: game.get(sq as Square)
          ? "radial-gradient(circle, transparent 55%, rgba(0, 0, 0, 0.3) 55%)"
          : "radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)",
      };
    }
  }

  function makeMove(sourceSquare: string, targetSquare: string, piece?: string) {
    const currentHistory = moveHistory.slice(0, currentMoveIndex + 1);
    const gameCopy = getGameAtIndex(currentHistory, currentHistory.length - 1);

    const isPromotion =
      piece && piece.toLowerCase().includes("p") &&
      (targetSquare[1] === "8" || targetSquare[1] === "1");

    try {
      const moveResult = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: isPromotion ? "q" : undefined,
      });
      if (!moveResult) return false;
    } catch {
      return false;
    }

    const newHistory = [...currentHistory, gameCopy.history().pop()!];
    const newIndex = newHistory.length - 1;
    setMoveHistory(newHistory);
    setCurrentMoveIndex(newIndex);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});

    if (!isRemoteUpdateRef.current) {
      broadcastMoves(newHistory, newIndex);
    }
    return true;
  }

  function onDrop({ sourceSquare, targetSquare, piece }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false;
    return makeMove(sourceSquare, targetSquare, piece.pieceType);
  }

  function onSquareClick({ square }: SquareHandlerArgs) {
    if (Object.keys(highlightedSquares).length > 0) {
      setHighlightedSquares({});
      if (!isRemoteUpdateRef.current) broadcastHighlights({});
    }
    if (arrows.length > 0) {
      setArrows([]);
      if (!isRemoteUpdateRef.current) broadcastArrows([]);
    }

    if (selectedSquare) {
      if (legalMoveSquares.includes(square as Square)) {
        const piece = game.get(selectedSquare);
        makeMove(selectedSquare, square, piece?.type);
        return;
      }
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
    }

    const piece = game.get(square as Square);
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square as Square);
    } else {
      setSelectedSquare(null);
    }
  }

  function onSquareMouseDown({ square }: SquareHandlerArgs, e: React.MouseEvent) {
    if (e.button === 2) {
      rightClickStartRef.current = square;
    }
  }

  function onSquareMouseUp({ square }: SquareHandlerArgs, e: React.MouseEvent) {
    if (e.button === 2 && rightClickStartRef.current) {
      if (rightClickStartRef.current === square) {
        setSelectedSquare(null);
        setHighlightedSquares((prev) => {
          const copy = { ...prev };
          if (copy[square]) {
            delete copy[square];
          } else {
            copy[square] = { backgroundColor: "rgba(235, 97, 80, 0.8)" };
          }
          if (!isRemoteUpdateRef.current) {
            broadcastHighlights(copy);
          }
          return copy;
        });
      }
      rightClickStartRef.current = null;
    }
  }

  function handleArrowsChange({ arrows: newArrows }: { arrows: Arrow[] }) {
    const combined = [...arrows];
    for (const a of newArrows) {
      const exists = combined.some(
        (e) => e.startSquare === a.startSquare && e.endSquare === a.endSquare
      );
      if (!exists) combined.push(a);
    }
    if (!isRemoteUpdateRef.current) broadcastArrows(combined);
  }

  const goToStart = useCallback(() => {
    setCurrentMoveIndex(-1);
    setSelectedSquare(null);
    setHighlightedSquares({});
    if (!isRemoteUpdateRef.current) broadcastNavigate(-1);
  }, [broadcastNavigate]);

  const goBack = useCallback(() => {
    setCurrentMoveIndex((i) => {
      const newIdx = Math.max(-1, i - 1);
      if (!isRemoteUpdateRef.current) broadcastNavigate(newIdx);
      return newIdx;
    });
    setSelectedSquare(null);
    setHighlightedSquares({});
  }, [broadcastNavigate]);

  const goForward = useCallback(() => {
    setCurrentMoveIndex((i) => {
      const newIdx = Math.min(moveHistory.length - 1, i + 1);
      if (!isRemoteUpdateRef.current) broadcastNavigate(newIdx);
      return newIdx;
    });
    setSelectedSquare(null);
    setHighlightedSquares({});
  }, [moveHistory.length, broadcastNavigate]);

  const goToEnd = useCallback(() => {
    const newIdx = moveHistory.length - 1;
    setCurrentMoveIndex(newIdx);
    setSelectedSquare(null);
    setHighlightedSquares({});
    if (!isRemoteUpdateRef.current) broadcastNavigate(newIdx);
  }, [moveHistory.length, broadcastNavigate]);

  const performReset = useCallback(() => {
    setMoveHistory([]);
    setCurrentMoveIndex(-1);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});
    setShowResetConfirm(false);
    if (!isRemoteUpdateRef.current) broadcastReset();
  }, [broadcastReset]);

  const requestReset = useCallback(() => {
    if (moveHistory.length === 0) {
      // Nothing to reset
      return;
    }
    setShowResetConfirm(true);
  }, [moveHistory.length]);

  // Track board size so the on-board move badge scales with one square.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => setSquareSize(el.clientWidth / 8);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard arrow navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goForward(); }
      else if (e.key === "Home") { e.preventDefault(); goToStart(); }
      else if (e.key === "End") { e.preventDefault(); goToEnd(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goForward, goToStart, goToEnd]);

  function handleImport() {
    const text = importText.trim();
    if (!text) return;
    setImportError("");

    try {
      const imported = new Chess();
      imported.loadPgn(text);
      const newHistory = imported.history();
      if (newHistory.length > 0) {
        setMoveHistory(newHistory);
        setCurrentMoveIndex(newHistory.length - 1);
        setShowImport(false);
        setImportText("");
        broadcastMoves(newHistory, newHistory.length - 1);
        return;
      }
    } catch {
      // Not valid PGN
    }

    if (text.includes("lichess.org") || text.includes("chess.com")) {
      handleLinkImport(text);
      return;
    }

    setImportError("Could not parse as PGN or game link. Paste a valid PGN or Lichess/Chess.com game link.");
  }

  async function handleLinkImport(url: string) {
    try {
      if (url.includes("lichess.org")) {
        const gameId = url.split("/").find((p) => p.length === 8 || p.length === 12) || url.split("/").pop();
        const res = await fetch(`https://lichess.org/game/export/${gameId}?pgnInJson=true`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.pgn) {
            loadPgnString(data.pgn);
            return;
          }
        }
        setImportError("Could not load Lichess game.");
        return;
      }

      if (url.includes("chess.com")) {
        const res = await fetch(`/api/chess-com/game?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.pgn) {
            loadPgnString(data.pgn);
            return;
          }
        }
        const errorData = await res.json().catch(() => null);
        setImportError(errorData?.error ?? "Could not load Chess.com game. Make sure the link is a valid game URL.");
        return;
      }
    } catch {
      setImportError("Failed to fetch game from link.");
    }
  }

  function loadPgnString(pgn: string) {
    const imported = new Chess();
    imported.loadPgn(pgn);
    const newHistory = imported.history();
    setMoveHistory(newHistory);
    setCurrentMoveIndex(newHistory.length - 1);
    setShowImport(false);
    setImportText("");
    setImportError("");
    broadcastMoves(newHistory, newHistory.length - 1);
  }

  function handleMoveClick(index: number) {
    setCurrentMoveIndex(index);
    setSelectedSquare(null);
    setHighlightedSquares({});
    if (!isRemoteUpdateRef.current) broadcastNavigate(index);
  }

  // Build move pairs (white + black) for the move list
  const movePairs: Array<{ num: number; white: string; black?: string }> = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1],
    });
  }

  const handleLines = useCallback((lines: EngineLine[], _depth: number, fen: string) => {
    setEngineLines(lines);
    if (lines.length > 0) {
      const bestCp = evalToCp(lines[0]);
      setEvalCache((prev) => {
        if (prev.get(fen) === bestCp) return prev;
        const next = new Map(prev);
        next.set(fen, bestCp);
        return next;
      });
    }
  }, []);

  // FEN at each move index (and -1 for starting position). Used to look up
  // cached evals when classifying moves.
  const fenByIndex = useMemo(() => {
    const map = new Map<number, string>();
    const g = new Chess();
    map.set(-1, g.fen());
    for (let i = 0; i < moveHistory.length; i++) {
      try {
        g.move(moveHistory[i]);
        map.set(i, g.fen());
      } catch {
        break;
      }
    }
    return map;
  }, [moveHistory]);

  // Engine arrows for the position currently displayed: bright green for the
  // best move, lighter green for any other line within ~2cp ("excellent").
  const currentFen = game.fen();
  const engineArrows = useMemo<Arrow[]>(() => {
    if (!showEngineArrows || engineLines.length === 0) return [];
    const bestCp = evalToCp(engineLines[0]);
    const sideToMove: "w" | "b" = currentFen.split(" ")[1] === "b" ? "b" : "w";
    const out: Arrow[] = [];
    for (let i = 0; i < engineLines.length; i++) {
      const line = engineLines[i];
      if (line.san.length === 0) continue;
      const lineCp = evalToCp(line);
      const loss = sideToMove === "w" ? bestCp - lineCp : lineCp - bestCp;
      if (loss > 2 && i > 0) break; // only "excellent" (≤2cp) shown alongside best
      try {
        const g = new Chess(currentFen);
        const mv = g.move(line.san[0]);
        if (!mv) continue;
        out.push({
          startSquare: mv.from,
          endSquare: mv.to,
          color: i === 0 ? "#81b64c" : "#a5d6a7",
        } as Arrow);
      } catch {
        continue;
      }
    }
    return out;
  }, [engineLines, currentFen, showEngineArrows]);

  // Classify a played move based on cached evals (parent best vs child best).
  function classifyMoveAtIndex(index: number): MoveClass | null {
    const parentFen = fenByIndex.get(index - 1);
    const childFen = fenByIndex.get(index);
    if (!parentFen || !childFen) return null;
    const parentBest = evalCache.get(parentFen);
    const childBest = evalCache.get(childFen);
    if (parentBest == null || childBest == null) return null;
    const parentTurn = parentFen.split(" ")[1];
    return classifyMove(parentBest, childBest, parentTurn === "w");
  }

  // Destination/source squares + classification of the move that produced the
  // currently displayed position — drives the on-board chess.com-style marker.
  const lastMove = useMemo(() => {
    if (currentMoveIndex < 0) return null;
    const g = new Chess();
    for (let i = 0; i <= currentMoveIndex && i < moveHistory.length; i++) {
      try { g.move(moveHistory[i]); } catch { return null; }
    }
    const verbose = g.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    return last ? { from: last.from as string, to: last.to as string } : null;
  }, [moveHistory, currentMoveIndex]);

  const currentMoveClass = currentMoveIndex >= 0 ? classifyMoveAtIndex(currentMoveIndex) : null;

  // Square size in px (board width / 8), so the corner badge scales with the board.
  const renderSquare: SquareRenderer = ({ square, children }) => {
    const isDest = !!currentMoveClass && lastMove?.to === square;
    const isFrom = !!currentMoveClass && lastMove?.from === square;
    const style: React.CSSProperties = {
      position: "relative",
      width: "100%",
      height: "100%",
      ...squareStyles[square],
    };
    if (currentMoveClass && (isDest || isFrom) && !squareStyles[square]?.backgroundColor) {
      style.backgroundColor = MOVE_CLASS_STYLE[currentMoveClass].tint;
    }
    const badgePx = squareSize * 0.4;
    return (
      <div style={style}>
        {children}
        {isDest && currentMoveClass && squareSize > 0 && (
          <div
            title={MOVE_CLASS_STYLE[currentMoveClass].label}
            style={{
              position: "absolute",
              top: "4%",
              right: "4%",
              width: badgePx,
              height: badgePx,
              borderRadius: "50%",
              background: MOVE_CLASS_STYLE[currentMoveClass].badge,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: badgePx * 0.55,
              lineHeight: 1,
              border: "1.5px solid #fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              zIndex: 6,
              pointerEvents: "none",
            }}
          >
            {MOVE_CLASS_STYLE[currentMoveClass].symbol}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-2 w-full max-w-[600px]" tabIndex={-1}>
      {/* Board + Eval Bar */}
      <div className="flex gap-1 w-full">
        <EvalBar fen={game.fen()} boardOrientation={boardOrientation} onLinesChange={handleLines} />
        <div ref={boardRef} className="flex-1 aspect-square">
          <Chessboard
            options={{
              position: game.fen(),
              onPieceDrop: onDrop,
              onSquareClick: onSquareClick,
              onSquareMouseDown: onSquareMouseDown,
              onSquareMouseUp: onSquareMouseUp,
              boardOrientation: boardOrientation,
              arrows: [...engineArrows, ...arrows],
              squareStyles: squareStyles,
              squareRenderer: renderSquare,
              animationDurationInMs: 200,
              allowDrawingArrows: true,
              clearArrowsOnClick: true,
              clearArrowsOnPositionChange: true,
              onArrowsChange: handleArrowsChange,
            }}
          />
        </div>
      </div>

      {/* Move navigation */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goToStart} disabled={currentMoveIndex < 0} title="First move">
          <ChevronsLeft className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goBack} disabled={currentMoveIndex < 0} title="Previous move">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goForward} disabled={currentMoveIndex >= moveHistory.length - 1} title="Next move">
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goToEnd} disabled={currentMoveIndex >= moveHistory.length - 1} title="Latest move">
          <ChevronsRight className="h-5 w-5" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setBoardOrientation((o) => o === "white" ? "black" : "white")} title="Flip board">
          <ArrowDownUp className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={requestReset} title="New game (clears the board)">
          <FilePlus className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowImport(!showImport)} title="Upload PGN or game link">
          <Upload className="h-5 w-5" />
        </Button>
        <Button
          variant={showEngineArrows ? "default" : "ghost"}
          size="icon"
          className="h-9 w-9"
          onClick={() => setShowEngineArrows((v) => !v)}
          title={showEngineArrows ? "Hide engine hints" : "Show engine best moves"}
        >
          <Lightbulb className="h-5 w-5" />
        </Button>
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div className="w-full rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 space-y-2">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Start a new game? This clears the board for both you and the {isCoach ? "student" : "coach"}.
            Move history will be lost.
          </p>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={performReset}>
              Clear board
            </Button>
          </div>
        </div>
      )}

      {/* Top engine lines — best move (★) and any other "excellent" moves within 2cp */}
      {engineLines.length > 0 && (() => {
        const bestCp = evalToCp(engineLines[0]);
        const sideToMove: "w" | "b" = currentFen.split(" ")[1] === "b" ? "b" : "w";
        const annotated = engineLines.map((line) => ({ line, cp: evalToCp(line) }));
        return (
          <div className="w-full rounded border bg-muted/30 p-2 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Best engine moves</p>
            <div className="space-y-1">
              {annotated.map(({ line, cp }, i) => {
                const cls: MoveClass = i === 0 ? "best" : classifyMove(bestCp, cp, sideToMove === "w");
                const style = MOVE_CLASS_STYLE[cls];
                return (
                  <div key={line.rank} className="flex items-baseline gap-2 text-sm font-mono">
                    <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 rounded text-xs font-bold ${style.color} ${style.bg}`}>
                      {style.symbol}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground w-12 shrink-0">
                      {formatLineEval(line)}
                    </span>
                    <span className="truncate text-sm">
                      {line.san.slice(0, 6).join(" ")}
                      {line.san.length > 6 && " …"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Move list — each move shows its quality classification (★ ! ✓ ?! ? ??) */}
      {movePairs.length > 0 && (
        <div className="w-full max-h-[180px] overflow-y-auto rounded border bg-muted/30 p-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-mono">
            {movePairs.map((pair) => {
              const whiteIdx = (pair.num - 1) * 2;
              const blackIdx = whiteIdx + 1;
              const whiteClass = classifyMoveAtIndex(whiteIdx);
              const blackClass = pair.black ? classifyMoveAtIndex(blackIdx) : null;
              return (
                <span key={pair.num} className="inline-flex items-baseline gap-1">
                  <span className="text-muted-foreground">{pair.num}.</span>
                  <button
                    type="button"
                    className={`inline-flex items-baseline gap-0.5 px-1 rounded ${currentMoveIndex === whiteIdx ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
                    onClick={() => handleMoveClick(whiteIdx)}
                  >
                    <span>{pair.white}</span>
                    {whiteClass && (
                      <span
                        className={`text-[10px] font-bold ${MOVE_CLASS_STYLE[whiteClass].color}`}
                        title={MOVE_CLASS_STYLE[whiteClass].label}
                      >
                        {MOVE_CLASS_STYLE[whiteClass].symbol}
                      </span>
                    )}
                  </button>
                  {pair.black && (
                    <button
                      type="button"
                      className={`inline-flex items-baseline gap-0.5 px-1 rounded ${currentMoveIndex === blackIdx ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
                      onClick={() => handleMoveClick(blackIdx)}
                    >
                      <span>{pair.black}</span>
                      {blackClass && (
                        <span
                          className={`text-[10px] font-bold ${MOVE_CLASS_STYLE[blackClass].color}`}
                          title={MOVE_CLASS_STYLE[blackClass].label}
                        >
                          {MOVE_CLASS_STYLE[blackClass].symbol}
                        </span>
                      )}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Import panel — fixed overlay so it doesn't push board around */}
      {showImport && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => { setShowImport(false); setImportText(""); setImportError(""); }}
          />
          <div
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,520px)] rounded-lg border bg-background p-4 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Upload a game</h3>
            <p className="text-sm text-muted-foreground">
              Paste a PGN or a Lichess / Chess.com game link:
            </p>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="1. e4 e5 2. Nf3... or https://lichess.org/... or https://chess.com/game/live/..."
              rows={5}
              className="font-mono text-sm"
            />
            {importError && <p className="text-sm text-destructive">{importError}</p>}
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setShowImport(false); setImportText(""); setImportError(""); }}>Cancel</Button>
              <Button size="sm" onClick={handleImport}>Import</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
