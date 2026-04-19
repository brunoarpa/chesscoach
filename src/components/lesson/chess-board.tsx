"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs, type Arrow } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw, Upload } from "lucide-react";
import { EvalBar } from "./eval-bar";

interface Props {
  lessonId: string;
  userId: string;
  isCoach: boolean;
}

export function ChessBoard({ lessonId, userId, isCoach }: Props) {
  // The canonical move history — all moves from start position
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [highlightedSquares, setHighlightedSquares] = useState<Record<string, React.CSSProperties>>({});
  const containerRef = useRef<HTMLDivElement>(null);

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
    setMoveHistory(newHistory);
    setCurrentMoveIndex(newHistory.length - 1);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});
    return true;
  }

  function onDrop({ sourceSquare, targetSquare, piece }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false;
    return makeMove(sourceSquare, targetSquare, piece.pieceType);
  }

  function onSquareClick({ square }: SquareHandlerArgs) {
    // Clear right-click highlights on any left click
    setHighlightedSquares({});

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

  function onSquareRightClick({ square }: SquareHandlerArgs) {
    setSelectedSquare(null);
    setHighlightedSquares((prev) => {
      const copy = { ...prev };
      if (copy[square]) {
        delete copy[square];
      } else {
        copy[square] = { backgroundColor: "rgba(235, 97, 80, 0.8)" };
      }
      return copy;
    });
  }

  const goToStart = useCallback(() => {
    setCurrentMoveIndex(-1);
    setSelectedSquare(null);
    setHighlightedSquares({});
  }, []);

  const goBack = useCallback(() => {
    setCurrentMoveIndex((i) => Math.max(-1, i - 1));
    setSelectedSquare(null);
    setHighlightedSquares({});
  }, []);

  const goForward = useCallback(() => {
    setCurrentMoveIndex((i) => Math.min(moveHistory.length - 1, i + 1));
    setSelectedSquare(null);
    setHighlightedSquares({});
  }, [moveHistory.length]);

  const goToEnd = useCallback(() => {
    setCurrentMoveIndex(moveHistory.length - 1);
    setSelectedSquare(null);
    setHighlightedSquares({});
  }, [moveHistory.length]);

  const resetBoard = useCallback(() => {
    setMoveHistory([]);
    setCurrentMoveIndex(-1);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});
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
        // Extract game ID from various chess.com URL formats
        // e.g. https://www.chess.com/game/live/167440485866?move=0
        // e.g. https://www.chess.com/game/live/167440485866
        const match = url.match(/chess\.com\/(?:game\/(?:live|daily)|live|daily)\/(\d+)/);
        if (match) {
          const gameId = match[1];
          const res = await fetch(`https://api.chess.com/pub/game/live/${gameId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.pgn) {
              loadPgnString(data.pgn);
              return;
            }
          }
          // Try daily games endpoint too
          const res2 = await fetch(`https://api.chess.com/pub/game/daily/${gameId}`);
          if (res2.ok) {
            const data2 = await res2.json();
            if (data2.pgn) {
              loadPgnString(data2.pgn);
              return;
            }
          }
        }
        setImportError("Could not load Chess.com game. Make sure the link is a valid game URL.");
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
            onSquareRightClick: onSquareRightClick,
            boardOrientation: boardOrientation,
            arrows: arrows,
            squareStyles: squareStyles,
            animationDurationInMs: 200,
            allowDrawingArrows: true,
            onArrowsChange: ({ arrows: newArrows }: { arrows: Arrow[] }) => setArrows(newArrows),
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
                  onClick={() => setCurrentMoveIndex((pair.num - 1) * 2)}
                >
                  {pair.white}
                </button>
                {pair.black && (
                  <button
                    type="button"
                    className={`ml-0.5 px-0.5 rounded ${currentMoveIndex === (pair.num - 1) * 2 + 1 ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
                    onClick={() => setCurrentMoveIndex((pair.num - 1) * 2 + 1)}
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
