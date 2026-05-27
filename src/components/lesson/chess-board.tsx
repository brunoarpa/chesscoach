"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs, type Arrow } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownUp, FilePlus, Upload } from "lucide-react";
import { EvalBar, type EngineLine } from "./eval-bar";
import { useBoardSync } from "@/hooks/use-board-sync";

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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleLines = useCallback((lines: EngineLine[]) => {
    setEngineLines(lines);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-2 w-full max-w-[600px]" tabIndex={-1}>
      {/* Board + Eval Bar */}
      <div className="flex gap-1 w-full">
        <EvalBar fen={game.fen()} boardOrientation={boardOrientation} onLinesChange={handleLines} />
        <div className="flex-1 aspect-square">
          <Chessboard
            options={{
              position: game.fen(),
              onPieceDrop: onDrop,
              onSquareClick: onSquareClick,
              onSquareMouseDown: onSquareMouseDown,
              onSquareMouseUp: onSquareMouseUp,
              boardOrientation: boardOrientation,
              arrows: arrows,
              squareStyles: squareStyles,
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

      {/* Engine lines (top 5 like chess.com) */}
      {engineLines.length > 0 && (
        <div className="w-full rounded border bg-muted/30 p-2 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Top engine lines</p>
          <div className="space-y-0.5">
            {engineLines.slice(0, 5).map((line) => (
              <div key={line.rank} className="flex items-baseline gap-2 text-sm font-mono">
                <span className="text-xs font-bold text-muted-foreground w-7 shrink-0">
                  {formatLineEval(line)}
                </span>
                <span className="truncate text-sm">
                  {line.san.slice(0, 6).join(" ")}
                  {line.san.length > 6 && " …"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Move list */}
      {movePairs.length > 0 && (
        <div className="w-full max-h-[160px] overflow-y-auto rounded border bg-muted/30 p-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-mono">
            {movePairs.map((pair) => (
              <span key={pair.num}>
                <span className="text-muted-foreground">{pair.num}.</span>
                <button
                  type="button"
                  className={`ml-0.5 px-1 rounded ${currentMoveIndex === (pair.num - 1) * 2 ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
                  onClick={() => handleMoveClick((pair.num - 1) * 2)}
                >
                  {pair.white}
                </button>
                {pair.black && (
                  <button
                    type="button"
                    className={`ml-0.5 px-1 rounded ${currentMoveIndex === (pair.num - 1) * 2 + 1 ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
                    onClick={() => handleMoveClick((pair.num - 1) * 2 + 1)}
                  >
                    {pair.black}
                  </button>
                )}
              </span>
            ))}
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
