"use client";

import { useState, useCallback, useMemo } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard, type PieceDropHandlerArgs } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw, Upload } from "lucide-react";

interface Props {
  lessonId: string;
  userId: string;
  isCoach: boolean;
}

export function ChessBoard({ lessonId, userId, isCoach }: Props) {
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [arrows, setArrows] = useState<Array<[Square, Square]>>([]);

  // Full move history from the game
  const allMoves = useMemo(() => game.history(), [game]);

  function makeMove(sourceSquare: string, targetSquare: string, piece: string) {
    const gameCopy = new Chess(game.fen());

    // Handle promotions
    const isPromotion = piece[1] === "P" && (targetSquare[1] === "8" || targetSquare[1] === "1");

    try {
      gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: isPromotion ? "q" : undefined,
      });
    } catch {
      return false;
    }

    setGame(gameCopy);
    const newHistory = gameCopy.history();
    setMoveHistory(newHistory);
    setCurrentMoveIndex(newHistory.length - 1);
    setArrows([]);
    return true;
  }

  function onDrop({ sourceSquare, targetSquare, piece }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false;
    return makeMove(sourceSquare, targetSquare, piece.pieceType);
  }

  const goToStart = useCallback(() => {
    const fresh = new Chess();
    // Replay moves up to start
    setCurrentMoveIndex(-1);
    // We need a way to show position at any point
    setGame(fresh);
  }, []);

  const goBack = useCallback(() => {
    if (currentMoveIndex < 0) return;
    const fresh = new Chess();
    for (let i = 0; i < currentMoveIndex; i++) {
      fresh.move(moveHistory[i]);
    }
    setCurrentMoveIndex(currentMoveIndex - 1);
    setGame(fresh);
  }, [currentMoveIndex, moveHistory]);

  const goForward = useCallback(() => {
    if (currentMoveIndex >= moveHistory.length - 1) return;
    const fresh = new Chess();
    for (let i = 0; i <= currentMoveIndex + 1; i++) {
      fresh.move(moveHistory[i]);
    }
    setCurrentMoveIndex(currentMoveIndex + 1);
    setGame(fresh);
  }, [currentMoveIndex, moveHistory]);

  const goToEnd = useCallback(() => {
    const fresh = new Chess();
    for (const move of moveHistory) {
      fresh.move(move);
    }
    setCurrentMoveIndex(moveHistory.length - 1);
    setGame(fresh);
  }, [moveHistory]);

  const resetBoard = useCallback(() => {
    setGame(new Chess());
    setMoveHistory([]);
    setCurrentMoveIndex(-1);
    setArrows([]);
  }, []);

  function handleImport() {
    const text = importText.trim();
    if (!text) return;

    try {
      const imported = new Chess();
      // Try loading as PGN first
      imported.loadPgn(text);
      const newHistory = imported.history();
      setGame(imported);
      setMoveHistory(newHistory);
      setCurrentMoveIndex(newHistory.length - 1);
      setShowImport(false);
      setImportText("");
      return;
    } catch {
      // Not valid PGN
    }

    try {
      // Try loading as FEN
      const imported = new Chess(text);
      setGame(imported);
      setMoveHistory([]);
      setCurrentMoveIndex(-1);
      setShowImport(false);
      setImportText("");
      return;
    } catch {
      // Not valid FEN either
    }

    // Try extracting game link
    handleLinkImport(text);
  }

  async function handleLinkImport(url: string) {
    try {
      // Lichess link
      if (url.includes("lichess.org")) {
        const gameId = url.split("/").find((p) => p.length === 8 || p.length === 12) || url.split("/").pop();
        const res = await fetch(`https://lichess.org/game/export/${gameId}?pgnInJson=true`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.pgn) {
            const imported = new Chess();
            imported.loadPgn(data.pgn);
            const newHistory = imported.history();
            setGame(imported);
            setMoveHistory(newHistory);
            setCurrentMoveIndex(newHistory.length - 1);
            setShowImport(false);
            setImportText("");
            return;
          }
        }
      }
    } catch {
      // Link import failed
    }
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
    <div className="flex flex-col items-center gap-2 w-full max-w-[560px]">
      {/* Board */}
      <div className="w-full aspect-square">
        <Chessboard
          options={{
            position: game.fen(),
            onPieceDrop: onDrop,
            boardOrientation: boardOrientation,
            arrows: arrows as unknown as import("react-chessboard").Arrow[],
            animationDurationInMs: 200,
            allowDrawingArrows: true,
          }}
        />
      </div>

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
                  onClick={() => {
                    const idx = (pair.num - 1) * 2;
                    const fresh = new Chess();
                    for (let i = 0; i <= idx; i++) fresh.move(moveHistory[i]);
                    setGame(fresh);
                    setCurrentMoveIndex(idx);
                  }}
                >
                  {pair.white}
                </button>
                {pair.black && (
                  <button
                    type="button"
                    className={`ml-0.5 px-0.5 rounded ${currentMoveIndex === (pair.num - 1) * 2 + 1 ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
                    onClick={() => {
                      const idx = (pair.num - 1) * 2 + 1;
                      const fresh = new Chess();
                      for (let i = 0; i <= idx; i++) fresh.move(moveHistory[i]);
                      setGame(fresh);
                      setCurrentMoveIndex(idx);
                    }}
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
            Paste a PGN, FEN, or Lichess game link:
          </p>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="1. e4 e5 2. Nf3... or FEN string, or https://lichess.org/..."
            rows={3}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleImport}>Import</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowImport(false); setImportText(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
