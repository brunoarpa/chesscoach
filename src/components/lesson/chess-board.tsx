"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard, defaultPieces, type PieceDropHandlerArgs, type SquareHandlerArgs, type Arrow, type SquareRenderer } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownUp, FilePlus, Upload, Lightbulb, ThumbsUp, type LucideIcon } from "lucide-react";
import { EvalBar, type EngineLine } from "./eval-bar";
import { useBoardSync } from "@/hooks/use-board-sync";
import {
  type MoveTree,
  type MoveNode,
  createTree,
  gameAtNode,
  fenAtNode,
  addMove,
  mainlineForward,
  endOfLine,
  pgnToTree,
  promoteVariation,
  deleteSubtree,
  sanitizeTree,
} from "@/lib/chess-tree";

// Move quality classification.
type MoveClass = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

// Per-class presentation for the on-board chess.com-style markers: `label` for
// the tooltip, `symbol`/`icon` for the glyph (icon wins when set), `badge` (solid)
// and `tint` (translucent) for the colors.
const MOVE_CLASS_STYLE: Record<MoveClass, { label: string; symbol: string; icon?: LucideIcon; badge: string; tint: string }> = {
  best:        { label: "Best",       symbol: "★",                  badge: "#81b64c", tint: "rgba(129,182,76,0.45)" },
  excellent:   { label: "Excellent",  symbol: "!", icon: ThumbsUp,  badge: "#81b64c", tint: "rgba(129,182,76,0.40)" },
  good:        { label: "Good",       symbol: "✓",                  badge: "#95b776", tint: "rgba(149,183,118,0.40)" },
  inaccuracy:  { label: "Inaccuracy", symbol: "?!",                 badge: "#f7c631", tint: "rgba(247,198,49,0.45)" },
  mistake:     { label: "Mistake",    symbol: "?",                  badge: "#ffa459", tint: "rgba(255,164,89,0.45)" },
  blunder:     { label: "Blunder",    symbol: "??",                 badge: "#fa412d", tint: "rgba(250,65,45,0.45)" },
};

// Vertical space (px) kept below the board for the move controls and a minimum
// info area (engine lines + move list). The board is sized from the column's
// height minus this reserve — a *stable* number — so the board never resizes
// when the engine-lines box appears/disappears or the move list grows. The info
// area itself scrolls to absorb that changing content.
const BOTTOM_RESERVE = 210;

// Promotion picker piece options, queen-first (nearest the promotion square).
const PROMOTION_PIECES: Array<{ type: "q" | "r" | "b" | "n"; key: string }> = [
  { type: "q", key: "Q" },
  { type: "r", key: "R" },
  { type: "b", key: "B" },
  { type: "n", key: "N" },
];

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
  // Persisted variation tree (preferred over the flat PGN when present).
  initialBoardTree?: unknown;
  // Practice/sandbox mode: one person exploring the board alone. Disables the
  // realtime sync so moves stay local and copy stops referring to a partner.
  local?: boolean;
}

function formatLineEval(line: EngineLine): string {
  if (line.mate !== null) return `${line.mate > 0 ? "+" : "-"}M${Math.abs(line.mate)}`;
  if (line.cp !== null) {
    const v = line.cp / 100;
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  }
  return "—";
}

// Seed the initial tree + cursor from a persisted tree (preferred) or PGN.
function initialTreeState(initialBoardTree: unknown, initialBoardPgn?: string): { tree: MoveTree; nodeId: string } {
  const fromTree = sanitizeTree(initialBoardTree);
  const tree = fromTree ?? (initialBoardPgn ? pgnToTree(initialBoardPgn) : createTree());
  return { tree, nodeId: endOfLine(tree, tree.rootId) };
}

export function ChessBoard({ lessonId, userId, isCoach, initialBoardPgn, initialBoardTree, local = false }: Props) {
  // Seed tree + cursor from one shared computation. Computing them in two
  // separate useState initializers would call initialTreeState twice — and for an
  // empty/PGN board that means two createTree() calls with *different* random root
  // ids, leaving currentNodeId pointing at a node absent from `tree`. addMove would
  // then find no parent and silently drop every move (pieces snap back).
  const [seed] = useState(() => initialTreeState(initialBoardTree, initialBoardPgn));
  const [tree, setTree] = useState<MoveTree>(seed.tree);
  const [currentNodeId, setCurrentNodeId] = useState<string>(seed.nodeId);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [highlightedSquares, setHighlightedSquares] = useState<Record<string, React.CSSProperties>>({});
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  // The FEN the current `engineLines` were computed for. The engine analyzes
  // asynchronously, so after a move/navigation `engineLines` still describes the
  // *previous* position until fresh analysis arrives — we tag them with their FEN
  // and only ever render arrows/the line list when it matches the shown position,
  // so stale best-move arrows can't linger on the new board.
  const [engineLinesFen, setEngineLinesFen] = useState<string>("");
  // Eval cache: best eval (cp, white perspective) keyed by FEN. Populated as the
  // engine analyzes each position the user visits — feeds move classification.
  const [evalCache, setEvalCache] = useState<Map<string, number>>(new Map());
  // Master engine-hint toggle (the lightbulb): gates the best-move arrows, the
  // "Best engine moves" list, and the move classifications all together. Shared
  // across both participants via board sync.
  const [showHints, setShowHints] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // Side length of the board in px, measured to fit the available area.
  const [boardPx, setBoardPx] = useState(0);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string; color: "w" | "b" } | null>(null);
  // Right-click context menu on a move in the list (promote / delete variation).
  const [moveMenu, setMoveMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // One square is an eighth of the board; drives the on-board move badges and
  // the promotion picker geometry.
  const squareSize = boardPx / 8;

  const rightClickStartRef = useRef<string | null>(null);
  const isRemoteUpdateRef = useRef(false);

  // ---- Board Sync ----
  const onRemoteMoves = useCallback((remoteTree: MoveTree, remoteNodeId: string) => {
    isRemoteUpdateRef.current = true;
    setTree(remoteTree);
    setCurrentNodeId(remoteNodeId);
    setSelectedSquare(null);
    isRemoteUpdateRef.current = false;
  }, []);

  const onRemoteNavigate = useCallback((remoteNodeId: string) => {
    isRemoteUpdateRef.current = true;
    setCurrentNodeId(remoteNodeId);
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

  const onRemoteHints = useCallback((remoteShowHints: boolean) => {
    isRemoteUpdateRef.current = true;
    setShowHints(remoteShowHints);
    isRemoteUpdateRef.current = false;
  }, []);

  const onRemoteReset = useCallback(() => {
    isRemoteUpdateRef.current = true;
    const fresh = createTree();
    setTree(fresh);
    setCurrentNodeId(fresh.rootId);
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
    broadcastHints,
    broadcastReset,
  } = useBoardSync({
    lessonId,
    userId,
    local,
    onRemoteMoves,
    onRemoteNavigate,
    onRemoteArrows,
    onRemoteHighlights,
    onRemoteHints,
    onRemoteReset,
  });

  const game = useMemo(() => gameAtNode(tree, currentNodeId), [tree, currentNodeId]);
  const atRoot = currentNodeId === tree.rootId;
  const hasForward = mainlineForward(tree, currentNodeId) !== null;
  const hasMoves = Object.keys(tree.nodes).length > 1;

  // Game status for the displayed position. chess.js enforces all move legality
  // (castling, en passant, pins, promotion) by rejecting illegal moves; here we
  // surface terminal/check states so the outcome is visible.
  const gameStatus: { text: string; tone: "over" | "check" } | null = (() => {
    const sideToMove = game.turn() === "w" ? "White" : "Black";
    const winner = game.turn() === "w" ? "Black" : "White";
    if (game.isCheckmate()) return { text: `Checkmate — ${winner} wins`, tone: "over" };
    if (game.isStalemate()) return { text: "Stalemate — draw", tone: "over" };
    if (game.isThreefoldRepetition()) return { text: "Draw by threefold repetition", tone: "over" };
    if (game.isInsufficientMaterial()) return { text: "Draw by insufficient material", tone: "over" };
    if (game.isDraw()) return { text: "Draw by 50-move rule", tone: "over" };
    if (game.isCheck()) return { text: `${sideToMove} is in check`, tone: "check" };
    return null;
  })();

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

  function makeMove(
    sourceSquare: string,
    targetSquare: string,
    piece?: string,
    promotion?: "q" | "r" | "b" | "n",
  ) {
    const gameCopy = gameAtNode(tree, currentNodeId);

    const isPromotion =
      !!piece && piece.toLowerCase().includes("p") &&
      (targetSquare[1] === "8" || targetSquare[1] === "1");

    // A promotion without a chosen piece: open the picker and wait. Only do this
    // when the underlying move is actually legal (e.g. ignore a pawn dropped on
    // an occupied straight-ahead square), so we never show a dead picker.
    if (isPromotion && !promotion) {
      const legal = gameCopy
        .moves({ square: sourceSquare as Square, verbose: true })
        .some((m) => m.to === targetSquare && m.promotion);
      if (!legal) return false;
      setPendingPromotion({ from: sourceSquare, to: targetSquare, color: gameCopy.turn() });
      return false;
    }

    let san: string;
    try {
      const moveResult = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: isPromotion ? promotion : undefined,
      });
      if (!moveResult) return false;
      san = moveResult.san;
    } catch {
      return false;
    }

    // Append (or re-enter) the move. Making a move from a mid-game position forks
    // a variation instead of discarding the rest of the line.
    const { tree: nextTree, nodeId: nextNodeId } = addMove(tree, currentNodeId, san);
    setTree(nextTree);
    setCurrentNodeId(nextNodeId);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});

    if (!isRemoteUpdateRef.current) {
      broadcastMoves(nextTree, nextNodeId);
    }
    return true;
  }

  function completePromotion(promotion: "q" | "r" | "b" | "n") {
    if (!pendingPromotion) return;
    makeMove(pendingPromotion.from, pendingPromotion.to, "p", promotion);
    setPendingPromotion(null);
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

  const navigateTo = useCallback((nodeId: string) => {
    setCurrentNodeId(nodeId);
    setSelectedSquare(null);
    setHighlightedSquares({});
    if (!isRemoteUpdateRef.current) broadcastNavigate(nodeId);
  }, [broadcastNavigate]);

  const goToStart = useCallback(() => {
    navigateTo(tree.rootId);
  }, [navigateTo, tree.rootId]);

  const goBack = useCallback(() => {
    const parentId = tree.nodes[currentNodeId]?.parentId;
    if (parentId != null) navigateTo(parentId);
  }, [navigateTo, tree, currentNodeId]);

  const goForward = useCallback(() => {
    const next = mainlineForward(tree, currentNodeId);
    if (next) navigateTo(next);
  }, [navigateTo, tree, currentNodeId]);

  const goToEnd = useCallback(() => {
    navigateTo(endOfLine(tree, currentNodeId));
  }, [navigateTo, tree, currentNodeId]);

  const performReset = useCallback(() => {
    const fresh = createTree();
    setTree(fresh);
    setCurrentNodeId(fresh.rootId);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});
    setShowResetConfirm(false);
    if (!isRemoteUpdateRef.current) broadcastReset();
  }, [broadcastReset]);

  const requestReset = useCallback(() => {
    if (!hasMoves) return; // Nothing to reset
    setShowResetConfirm(true);
  }, [hasMoves]);

  const toggleHints = useCallback(() => {
    setShowHints((v) => {
      const next = !v;
      if (!isRemoteUpdateRef.current) broadcastHints(next);
      return next;
    });
  }, [broadcastHints]);

  // ---- Move-list context-menu actions (promote / delete a variation) ----
  const promoteMoveNode = useCallback((nodeId: string) => {
    const next = promoteVariation(tree, nodeId);
    setTree(next);
    setMoveMenu(null);
    if (!isRemoteUpdateRef.current) broadcastMoves(next, currentNodeId);
  }, [tree, currentNodeId, broadcastMoves]);

  const deleteMoveNode = useCallback((nodeId: string) => {
    const { tree: next, nodeId: fallback } = deleteSubtree(tree, nodeId);
    // If the displayed node was inside the deleted subtree, fall back to the parent.
    const stillExists = !!next.nodes[currentNodeId];
    const newCurrent = stillExists ? currentNodeId : fallback;
    setTree(next);
    setCurrentNodeId(newCurrent);
    setMoveMenu(null);
    if (!isRemoteUpdateRef.current) broadcastMoves(next, newCurrent);
  }, [tree, currentNodeId, broadcastMoves]);

  // Size the board to the largest square that fits the column: its full width
  // (minus the eval bar) and its height minus a fixed bottom reserve. Measuring
  // the *column* (a stable box) rather than the leftover flex space means the
  // board keeps its size when the engine-lines box or move list change height —
  // those live in a scrolling area below, so the board no longer zooms in/out
  // on every move.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const reserve = showHints ? 32 : 0; // eval bar (~28px) + gap
      const w = el.clientWidth - reserve;
      const h = el.clientHeight - BOTTOM_RESERVE;
      setBoardPx(Math.max(0, Math.floor(Math.min(w, h))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showHints]);

  // Dismiss the move context menu on any outside click.
  useEffect(() => {
    if (!moveMenu) return;
    const close = () => setMoveMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [moveMenu]);

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

  function loadTreeFromPgn(pgn: string) {
    const nextTree = pgnToTree(pgn);
    const endId = endOfLine(nextTree, nextTree.rootId);
    setTree(nextTree);
    setCurrentNodeId(endId);
    setShowImport(false);
    setImportText("");
    setImportError("");
    if (!isRemoteUpdateRef.current) broadcastMoves(nextTree, endId);
  }

  function handleImport() {
    const text = importText.trim();
    if (!text) return;
    setImportError("");

    try {
      const imported = new Chess();
      imported.loadPgn(text);
      if (imported.history().length > 0) {
        loadTreeFromPgn(text);
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
            loadTreeFromPgn(data.pgn);
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
            loadTreeFromPgn(data.pgn);
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

  const handleLines = useCallback((lines: EngineLine[], _depth: number, fen: string) => {
    setEngineLines(lines);
    setEngineLinesFen(fen);
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

  // Engine arrows for the position currently displayed: bright green for the
  // best move, lighter green for any other line within ~2cp ("excellent").
  const currentFen = game.fen();
  const engineArrows = useMemo<Arrow[]>(() => {
    // Only draw for the position the lines actually belong to — never replay a
    // previous position's best move onto the current board.
    if (!showHints || engineLines.length === 0 || engineLinesFen !== currentFen) return [];
    const bestCp = evalToCp(engineLines[0]);
    const sideToMove: "w" | "b" = currentFen.split(" ")[1] === "b" ? "b" : "w";
    const out: Arrow[] = [];
    // react-chessboard keys each arrow by start+end square, so two arrows on the
    // same squares collide and React leaves orphaned arrow DOM that never clears.
    // Mid-search Stockfish can briefly report the same first move in several
    // MultiPV slots, so dedupe by square here.
    const seen = new Set<string>();
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
        const key = `${mv.from}-${mv.to}`;
        if (seen.has(key)) continue;
        seen.add(key);
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
  }, [engineLines, engineLinesFen, currentFen, showHints]);

  // Classify a played move based on cached evals (parent best vs node best).
  const classifyMoveAtNode = useCallback((nodeId: string): MoveClass | null => {
    const node = tree.nodes[nodeId];
    if (!node || node.parentId === null) return null;
    const parentFen = fenAtNode(tree, node.parentId);
    const childFen = fenAtNode(tree, nodeId);
    const parentBest = evalCache.get(parentFen);
    const childBest = evalCache.get(childFen);
    if (parentBest == null || childBest == null) return null;
    const parentTurn = parentFen.split(" ")[1];
    return classifyMove(parentBest, childBest, parentTurn === "w");
  }, [tree, evalCache]);

  // Destination/source squares of the move that produced the currently displayed
  // position — drives the on-board chess.com-style marker.
  const lastMove = useMemo(() => {
    if (atRoot) return null;
    const verbose = game.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    return last ? { from: last.from as string, to: last.to as string } : null;
  }, [game, atRoot]);

  const currentMoveClass = showHints && !atRoot ? classifyMoveAtNode(currentNodeId) : null;

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
            {(() => {
              const Icon = MOVE_CLASS_STYLE[currentMoveClass].icon;
              return Icon
                ? <Icon size={badgePx * 0.62} strokeWidth={2.5} fill="#fff" />
                : MOVE_CLASS_STYLE[currentMoveClass].symbol;
            })()}
          </div>
        )}
      </div>
    );
  };

  // Promotion picker: a vertical strip of Q/R/B/N over the promotion file,
  // queen nearest the promotion square (chess.com-style). Click outside to cancel.
  function renderPromotionPicker() {
    if (!pendingPromotion || squareSize <= 0) return null;
    const { from, to, color } = pendingPromotion;
    // Only show if the promotion is still legal in the displayed position (it may
    // have changed via navigation / a remote move since the picker was opened).
    const stillValid = game
      .moves({ square: from as Square, verbose: true })
      .some((m) => m.to === to && m.promotion && m.color === color);
    if (!stillValid) return null;
    const f = to.charCodeAt(0) - 97; // 0..7
    const r = parseInt(to[1], 10); // 1..8
    const dCol = boardOrientation === "white" ? f : 7 - f;
    const dRow = boardOrientation === "white" ? 8 - r : r - 1; // 0 = top of display
    const goingDown = dRow === 0;
    const pieces = goingDown ? PROMOTION_PIECES : [...PROMOTION_PIECES].reverse();
    const stripTop = goingDown ? 0 : (8 - PROMOTION_PIECES.length) * squareSize;

    return (
      <div className="absolute inset-0 z-20">
        <div className="absolute inset-0 bg-black/40" onClick={() => setPendingPromotion(null)} />
        <div
          className="absolute flex flex-col overflow-hidden rounded shadow-2xl"
          style={{ left: dCol * squareSize, top: stripTop, width: squareSize }}
        >
          {pieces.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => completePromotion(p.type)}
              className="bg-white hover:bg-emerald-200 transition-colors"
              style={{ width: squareSize, height: squareSize, padding: squareSize * 0.06, border: "none", cursor: "pointer" }}
              title={`Promote to ${p.key}`}
            >
              {defaultPieces[`${color}${p.key}`]?.({ svgStyle: { width: "100%", height: "100%" } })}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Move list with variations (chess.com-style) ----
  // Renders the line starting at `startId`, following the main continuation
  // (children[0]); where a node has variation siblings, each is rendered as an
  // indented, parenthesized sub-line right after the move it diverges from.
  function renderLine(startId: string, startPly: number): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let cur: string | null = startId;
    let ply = startPly;
    let needsNumber = true; // show the move number at the start of a line / after a variation

    while (cur) {
      const nodeId: string = cur;
      const node: MoveNode | undefined = tree.nodes[nodeId];
      if (!node) break;
      const isWhite = ply % 2 === 1;
      const moveNum = Math.ceil(ply / 2);
      const prefix = isWhite ? `${moveNum}.` : needsNumber ? `${moveNum}…` : "";
      const isActive = nodeId === currentNodeId;

      out.push(
        <button
          key={nodeId}
          type="button"
          onClick={() => navigateTo(nodeId)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMoveMenu({ nodeId, x: e.clientX, y: e.clientY });
          }}
          className={`px-1 rounded ${isActive ? "bg-primary/20 font-bold" : "hover:bg-muted"}`}
        >
          {prefix ? `${prefix} ${node.san}` : node.san}
        </button>
      );
      needsNumber = false;

      // Variation siblings: alternatives to this (mainline) node.
      const parent = node.parentId ? tree.nodes[node.parentId] : null;
      if (parent && parent.children[0] === nodeId && parent.children.length > 1) {
        for (const sibId of parent.children.slice(1)) {
          out.push(
            <div
              key={`var-${sibId}`}
              className="my-0.5 ml-3 pl-2 border-l border-border text-xs text-muted-foreground"
            >
              <span className="mr-0.5">(</span>
              {renderLine(sibId, ply)}
              <span className="ml-0.5">)</span>
            </div>
          );
        }
        needsNumber = true; // the mainline continuation repeats its number after a variation
      }

      cur = node.children[0] ?? null;
      ply++;
    }
    return out;
  }

  const mainlineStart = mainlineForward(tree, tree.rootId);

  // Engine + manual/remote arrows, deduped by square pair. react-chessboard keys
  // arrows solely by start+end square; any duplicate (e.g. an engine arrow that
  // coincides with a drawn one) collides and leaves ghost arrows React can't
  // reconcile away — so collapse them to one here.
  const boardArrows = (() => {
    const seen = new Set<string>();
    const out: Arrow[] = [];
    for (const a of [...engineArrows, ...arrows]) {
      const key = `${a.startSquare}-${a.endSquare}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  })();

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-2 w-full max-w-[600px] h-full min-h-0" tabIndex={-1}>
      {/* Board + Eval Bar. The eval bar is part of the engine-hint bundle, so the
          lightbulb gates it alongside the arrows, line list, and classifications —
          unmounting it also stops the Stockfish worker while hints are off.
          Fixed height (shrink-0): the board is sized to the measured square
          (boardPx) from the column, not from leftover flex space, so it never
          resizes when the content below changes. */}
      <div className="flex gap-1 w-full shrink-0 items-start justify-center">
        {showHints && (
          <EvalBar fen={game.fen()} boardOrientation={boardOrientation} onLinesChange={handleLines} heightPx={boardPx > 0 ? boardPx : undefined} />
        )}
        <div className="relative aspect-square shrink-0" style={{ width: boardPx || undefined, height: boardPx || undefined }}>
          <Chessboard
            options={{
              position: game.fen(),
              onPieceDrop: onDrop,
              onSquareClick: onSquareClick,
              onSquareMouseDown: onSquareMouseDown,
              onSquareMouseUp: onSquareMouseUp,
              boardOrientation: boardOrientation,
              arrows: boardArrows,
              squareStyles: squareStyles,
              squareRenderer: renderSquare,
              animationDurationInMs: 200,
              allowDrawingArrows: true,
              clearArrowsOnClick: true,
              clearArrowsOnPositionChange: true,
              onArrowsChange: handleArrowsChange,
            }}
          />
          {renderPromotionPicker()}
        </div>
      </div>

      {/* Game status — check / checkmate / stalemate / draws (incl. repetition) */}
      {gameStatus && (
        <div
          className={`w-full text-center text-sm font-semibold rounded-md px-3 py-1.5 ${
            gameStatus.tone === "over"
              ? "bg-primary/15 text-foreground"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          }`}
        >
          {gameStatus.text}
        </div>
      )}

      {/* Move navigation */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goToStart} disabled={atRoot} title="First move">
          <ChevronsLeft className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goBack} disabled={atRoot} title="Previous move">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goForward} disabled={!hasForward} title="Next move">
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goToEnd} disabled={!hasForward} title="Latest move">
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
          variant={showHints ? "default" : "ghost"}
          size="icon"
          className="h-9 w-9"
          onClick={toggleHints}
          title={showHints ? "Hide engine hints (eval bar, best moves & move ratings)" : "Show engine hints (eval bar, best moves & move ratings)"}
        >
          <Lightbulb className="h-5 w-5" />
        </Button>
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div className="w-full rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 space-y-2">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Start a new game? This clears the board
            {local ? "" : ` for both you and the ${isCoach ? "student" : "coach"}`}.
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

      {/* Info area — engine lines + move list. This region takes the remaining
          height and scrolls, so the engine-lines box appearing/disappearing or
          the move list growing changes only what scrolls here, never the board. */}
      <div className="w-full flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
      {/* Top engine lines — eval + principal variation for each (hidden when hints off) */}
      {showHints && engineLines.length > 0 && engineLinesFen === currentFen && (
        <div className="w-full shrink-0 rounded border bg-muted/30 p-2 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Best engine moves</p>
          <div className="space-y-1">
            {engineLines.map((line) => (
              <div key={line.rank} className="flex items-baseline gap-2 text-sm font-mono">
                <span className="text-xs font-bold text-muted-foreground w-12 shrink-0">
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

      {/* Move list — main line plus indented variations; right-click a move for
          promote / delete. Classifications are shown on the board, not here. */}
      {mainlineStart && (
        <div className="w-full shrink-0 rounded border bg-muted/30 p-2">
          <div className="text-sm font-mono leading-relaxed [&>button]:mr-1">
            {renderLine(mainlineStart, 1)}
          </div>
        </div>
      )}
      </div>

      {/* Move context menu (promote / delete a variation) */}
      {moveMenu && (() => {
        const node = tree.nodes[moveMenu.nodeId];
        const parent = node?.parentId ? tree.nodes[node.parentId] : null;
        const isVariation = !!parent && parent.children[0] !== moveMenu.nodeId;
        return (
          <div
            className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 shadow-md text-sm"
            style={{ left: moveMenu.x, top: moveMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={!isVariation}
              onClick={() => promoteMoveNode(moveMenu.nodeId)}
              className="w-full text-left px-2 py-1 rounded hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Promote to main line
            </button>
            <button
              type="button"
              onClick={() => deleteMoveNode(moveMenu.nodeId)}
              className="w-full text-left px-2 py-1 rounded text-destructive hover:bg-muted"
            >
              Delete from here
            </button>
          </div>
        );
      })()}

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
