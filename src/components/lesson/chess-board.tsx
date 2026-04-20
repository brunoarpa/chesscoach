"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs, type Arrow } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw, Upload } from "lucide-react";
import { EvalBar } from "./eval-bar";
import { useBoardSync } from "@/hooks/use-board-sync";

interface Props {
  lessonId: string;
  userId: string;
  isCoach: boolean;
  initialBoardPgn?: string;
}

export function ChessBoard({ lessonId, userId, isCoach, initialBoardPgn }: Props) {
  // The canonical move history — all moves from start position
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Track right-click start square to distinguish highlight (same-square) from arrow drag (cross-square)
  const rightClickStartRef = useRef<string | null>(null);

  // Skip broadcasting for remote updates
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

  // Derive game state from moveHistory + currentMoveIndex
  const getGameAtIndex = useCallback((moves: string[], index: number) => {
    const g = new Chess();
    for (let i = 0; i <= index && i < moves.length; i++) {
      g.move(moves[i]);
    }
    return g;
  }, []);

  const game = getGameAtIndex(moveHistory, currentMoveIndex);

  // Get legal moves for selected piece
  const legalMoveSquares = selectedSquare
    ? game.moves({ square: selectedSquare, verbose: true }).map((m) => m.to)
    : [];

  // Build square styles: selected square + legal moves + right-click highlights
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
    // If we're not at the end of history, truncate future moves
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

    // Broadcast move to other participant
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
    // Clear right-click highlights and arrows on any left click (like chess.com)
    if (Object.keys(highlightedSquares).length > 0) {
      setHighlightedSquares({});
      if (!isRemoteUpdateRef.current) broadcastHighlights({});
    }
    if (arrows.length > 0) {
      setArrows([]);
      if (!isRemoteUpdateRef.current) broadcastArrows([]);
    }

    if (selectedSquare) {
      // Try to move to clicked square
      if (legalMoveSquares.includes(square as Square)) {
        const piece = game.get(selectedSquare);
        makeMove(selectedSquare, square, piece?.type);
        return;
      }
      // Clicked same square — deselect
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
    }

    // Select new piece if it exists and belongs to current turn
    const piece = game.get(square as Square);
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square as Square);
    } else {
      setSelectedSquare(null);
    }
  }

  function onSquareMouseDown({ square }: SquareHandlerArgs, e: React.MouseEvent) {
    if (e.button === 2) {
      // Record where the right-click started
      rightClickStartRef.current = square;
    }
  }

  function onSquareMouseUp({ square }: SquareHandlerArgs, e: React.MouseEvent) {
    if (e.button === 2 && rightClickStartRef.current) {
      if (rightClickStartRef.current === square) {
        // Same square: toggle highlight (like chess.com right-click)
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
      // Cross-square: library handles arrow drawing internally
      rightClickStartRef.current = null;
    }
  }

  function handleArrowsChange({ arrows: newArrows }: { arrows: Arrow[] }) {
    // Merge internal arrows with our controlled arrows (remote) for broadcasting
    // The library's internalArrows are reported here; our `arrows` state has remote arrows
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

  const resetBoard = useCallback(() => {
    setMoveHistory([]);
    setCurrentMoveIndex(-1);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});
    if (!isRemoteUpdateRef.current) broadcastReset();
  }, [broadcastReset]);

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

    // Try loading as PGN first
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

    // Try as game link (Lichess or Chess.com)
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
        // Use server-side proxy to avoid CORS issues
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

  // Display moves in pairs (white + black)
  const movePairs: Array<{ num: number; white: string; black?: string }> = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1],
    });
  }

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-2 w-full max-w-[600px]" tabIndex={-1}>
      {/* Board + Eval Bar */}
      <div className="flex gap-1 w-full">
        <EvalBar fen={game.fen()} boardOrientation={boardOrientation} />
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
        />        </div>      </div>

      {/* Move navigation */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToStart} disabled={currentMoveIndex < 0}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goBack} disabled={currentMoveIndex < 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goForward} disabled={currentMoveIndex >= moveHistory.length - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToEnd} disabled={currentMoveIndex >= moveHistory.length - 1}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setBoardOrientation((o) => o === "white" ? "black" : "white")}>
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetBoard}>
          <span className="text-xs font-bold">New</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowImport(!showImport)}>
          <Upload className="h-4 w-4" />
        </Button>
      </div>

      {/* Move list */}
      {movePairs.length > 0 && (
        <div className="w-full max-h-[120px] overflow-y-auto rounded border bg-muted/30 p-2">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono">
            {movePairs.map((pair) => (
              <span key={pair.num}>
                <span className="text-muted-foreground">{pair.num}.</span>
                <button
                  type="button"
                  className={`ml-0.5 px-0.5 rounded ${currentMoveIndex === (pair.num - 1) * 2 ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
                  onClick={() => handleMoveClick((pair.num - 1) * 2)}
                >
                  {pair.white}
                </button>
                {pair.black && (
                  <button
                    type="button"
                    className={`ml-0.5 px-0.5 rounded ${currentMoveIndex === (pair.num - 1) * 2 + 1 ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
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

      {/* Import panel */}
      {showImport && (
        <div className="w-full space-y-2 p-3 rounded border bg-background">
          <p className="text-xs text-muted-foreground">
            Paste a PGN or a Lichess / Chess.com game link:
          </p>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="1. e4 e5 2. Nf3... or https://lichess.org/... or https://chess.com/game/live/..."
            rows={3}
            className="font-mono text-xs"
          />
          {importError && <p className="text-xs text-destructive">{importError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleImport}>Import</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowImport(false); setImportText(""); setImportError(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
