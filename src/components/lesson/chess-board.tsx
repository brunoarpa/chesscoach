"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard, defaultPieces, type PieceDropHandlerArgs, type SquareHandlerArgs, type Arrow, type SquareRenderer } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownUp, FilePlus, Upload, Lightbulb, Trash2 } from "lucide-react";
import { EvalBar, type EngineLine } from "./eval-bar";
import { useBoardSync } from "@/hooks/use-board-sync";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useGameReview } from "@/hooks/use-game-review";
import {
  type MoveTree,
  type MoveNode,
  createTree,
  gameAtNode,
  fenAtNode,
  addMove,
  mainlineForward,
  mainlineNodeIds,
  endOfLine,
  pgnToTree,
  fenToTree,
  promoteVariation,
  deleteSubtree,
  sanitizeTree,
} from "@/lib/chess-tree";
import {
  type MoveClass,
  type PosEval,
  type ReviewPosition,
  classifyPlayedMove,
  cpToExpectedPoints,
  evalToCp,
  summarizeGame,
  type GameReviewSummary,
} from "@/lib/game-review";
import { MOVE_CLASS_STYLE } from "./move-class-style";

// Plain last-move highlight used when the engine is off (chess.com-style yellow),
// so both players can always see the most recent move and whose turn it is.
const LAST_MOVE_TINT = "rgba(255,213,0,0.42)";

// The board is sized to fill the column's *visible* height (a stable number, so
// it never resizes as the content below changes) minus these reserves, then
// capped by width. The move controls stay on-screen with the board; the move
// list and best-engine-moves box flow below and the column scrolls to reach
// them. MIN_BOARD keeps the board usable on very short windows (it overflows
// and the column scrolls rather than collapsing).
const BOARD_BOTTOM_RESERVE = 64; // move controls + gap kept under the board
const COLUMN_PADDING = 32; // p-4 (16px top + bottom) on the board column
const EVAL_BAR_RESERVE = 32; // eval bar (~28px) + gap, only when hints are on
const MIN_BOARD = 200;

// Promotion picker piece options, queen-first (nearest the promotion square).
const PROMOTION_PIECES: Array<{ type: "q" | "r" | "b" | "n"; key: string }> = [
  { type: "q", key: "Q" },
  { type: "r", key: "R" },
  { type: "b", key: "B" },
  { type: "n", key: "N" },
];

// ---- Position editor (chess.com-style "set up position") ----
// A board square -> piece map, matching react-chessboard's PositionDataType and
// defaultPieces keys ("wP", "bK", ...). pieceType = color letter + uppercase type.
type EditorPosition = Record<string, { pieceType: string }>;

// Palette layout: pawn, bishop, knight, rook, queen, king (chess.com order).
const EDITOR_PIECE_TYPES = ["P", "B", "N", "R", "Q", "K"] as const;
const PIECE_NAMES: Record<string, string> = {
  P: "pawn", B: "bishop", N: "knight", R: "rook", Q: "queen", K: "king",
};

// chess.js board() -> editor position map ({ e4: { pieceType: "wP" } }).
function gameToEditorPosition(game: Chess): EditorPosition {
  const pos: EditorPosition = {};
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell) pos[cell.square] = { pieceType: `${cell.color}${cell.type.toUpperCase()}` };
    }
  }
  return pos;
}

// Editor position + side to move -> FEN. Castling/en-passant are cleared and the
// clocks reset, as for any hand-built position; chess.js validates it on load.
function editorPositionToFen(pos: EditorPosition, turn: "w" | "b"): string {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let rankStr = "";
    let empty = 0;
    for (const f of files) {
      const piece = pos[`${f}${r}`];
      if (!piece) { empty++; continue; }
      if (empty > 0) { rankStr += empty; empty = 0; }
      const letter = piece.pieceType[1].toLowerCase();
      rankStr += piece.pieceType[0] === "w" ? letter.toUpperCase() : letter;
    }
    if (empty > 0) rankStr += empty;
    ranks.push(rankStr);
  }
  return `${ranks.join("/")} ${turn} - - 0 1`;
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
  // Open the import panel on mount. Used by the public game-review page so the
  // first thing a visitor sees is "paste your game" rather than a hidden button.
  startImportOpen?: boolean;
  // Notified when the whole-game report card is (re)computed, so a parent can
  // render the per-class breakdown elsewhere (e.g. the review page's sidebar,
  // keeping the central board column uncluttered). Null while not yet complete.
  onReviewSummary?: (summary: GameReviewSummary | null) => void;
}

function formatLineEval(line: EngineLine): string {
  if (line.mate !== null) return `${line.mate > 0 ? "+" : "-"}M${Math.abs(line.mate)}`;
  if (line.cp !== null) {
    const v = line.cp / 100;
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  }
  return "-";
}

// Seed the initial tree + cursor from a persisted tree (preferred) or PGN.
function initialTreeState(initialBoardTree: unknown, initialBoardPgn?: string): { tree: MoveTree; nodeId: string } {
  const fromTree = sanitizeTree(initialBoardTree);
  const tree = fromTree ?? (initialBoardPgn ? pgnToTree(initialBoardPgn) : createTree());
  return { tree, nodeId: endOfLine(tree, tree.rootId) };
}

export function ChessBoard({ lessonId, userId, isCoach, initialBoardPgn, initialBoardTree, local = false, startImportOpen = false, onReviewSummary }: Props) {
  // Seed tree + cursor from one shared computation. Computing them in two
  // separate useState initializers would call initialTreeState twice - and for an
  // empty/PGN board that means two createTree() calls with *different* random root
  // ids, leaving currentNodeId pointing at a node absent from `tree`. addMove would
  // then find no parent and silently drop every move (pieces snap back).
  const [seed] = useState(() => initialTreeState(initialBoardTree, initialBoardPgn));
  const [tree, setTree] = useState<MoveTree>(seed.tree);
  const [currentNodeId, setCurrentNodeId] = useState<string>(seed.nodeId);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [showImport, setShowImport] = useState(startImportOpen);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [highlightedSquares, setHighlightedSquares] = useState<Record<string, React.CSSProperties>>({});
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  // The FEN the current `engineLines` were computed for. The engine analyzes
  // asynchronously, so after a move/navigation `engineLines` still describes the
  // *previous* position until fresh analysis arrives - we tag them with their FEN
  // and only ever render arrows/the line list when it matches the shown position,
  // so stale best-move arrows can't linger on the new board.
  const [engineLinesFen, setEngineLinesFen] = useState<string>("");
  // Eval cache: engine read-out (best/2nd-best/best move, white perspective)
  // keyed by FEN. Populated as the live engine analyzes each position the user
  // visits - feeds move classification.
  const [evalCache, setEvalCache] = useState<Map<string, PosEval>>(new Map());
  // Mainline positions queued for the whole-game review (set when a game is
  // imported). Empty means no review is running.
  const [reviewFens, setReviewFens] = useState<string[]>([]);
  // Player names/ratings parsed from an imported PGN's headers, so a reviewer
  // can see who was White/Black and their ratings. Null for hand-entered FENs.
  const [gameInfo, setGameInfo] = useState<{
    white: string;
    black: string;
    whiteElo: string;
    blackElo: string;
    result: string;
  } | null>(null);
  // Master engine-hint toggle (the lightbulb): gates the best-move arrows, the
  // "Best engine moves" list, and the move classifications all together. The
  // engine is coach-only (see engineEnabled below), so this is purely local to
  // the coach and is never shared with the student.
  const [showHints, setShowHints] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // In a real lesson the engine is a coach-only teaching aid: it runs only on the
  // coach's device and the student never sees the eval bar, best-move arrows, or
  // move ratings (the coach explains what the engine shows). In practice/solo mode
  // (`local`) the board is the user's own, so the engine is theirs to use. Phones
  // now get the engine too, but with a lighter search (fewer lines, shorter time)
  // so the in-browser Stockfish doesn't stutter on a weak CPU.
  const isMobile = useMediaQuery("(max-width: 767px)");
  const engineEnabled = isCoach || local;
  // Lighter live-engine settings on phones; the desktop defaults stay full.
  const evalMultiPv = isMobile ? 2 : 5;
  const evalMoveTimeMs = isMobile ? 300 : 500;

  // Background whole-game review: evaluates every imported mainline position so
  // the move list and report card can be filled in while the user explores.
  const review = useGameReview(reviewFens, engineEnabled, isMobile ? 250 : 350);
  // Per-FEN engine read-out, white perspective. The live deep analysis of the
  // current position (evalCache) takes precedence over the shallower review pass.
  const combinedEvals = useMemo(() => {
    const m = new Map<string, PosEval>(review.evals);
    for (const [k, v] of evalCache) m.set(k, v);
    return m;
  }, [review.evals, evalCache]);

  // Mainline node ids (root first) - used to map graph points back to moves.
  const mainlineIds = useMemo(() => mainlineNodeIds(tree), [tree]);

  // Precompute each mainline move's positions in a single forward pass (one move
  // per node, O(moves)). The previous version called fenAtNode per node, which
  // replays the game from the start each time - O(moves^2) - and recomputed on
  // every tree change, so playing a brand-new move off the line stalled the
  // board for ~1s. Walking forward once keeps it instant.
  const mainlinePositions = useMemo(() => {
    const out: { nodeId: string; fen: string; parentFen: string; moverIsWhite: boolean }[] = [];
    let game: Chess;
    try {
      game = tree.startFen ? new Chess(tree.startFen) : new Chess();
    } catch {
      return out;
    }
    let parentFen = game.fen();
    for (let i = 1; i < mainlineIds.length; i++) {
      const node = tree.nodes[mainlineIds[i]];
      if (!node) break;
      try {
        game.move(node.san);
      } catch {
        break;
      }
      const fen = game.fen();
      out.push({ nodeId: node.id, fen, parentFen, moverIsWhite: parentFen.split(" ")[1] === "w" });
      parentFen = fen;
    }
    return out;
  }, [tree, mainlineIds]);

  // Classification per mainline node, recomputed only when the evals change
  // (cheap O(moves) lookups, no board replay). Uses the next mainline position
  // (one ply later) so sacrifice detection can see the opponent's reply.
  const moveClasses = useMemo(() => {
    const m = new Map<string, MoveClass>();
    for (let i = 0; i < mainlinePositions.length; i++) {
      const p = mainlinePositions[i];
      const parentPE = combinedEvals.get(p.parentFen);
      const childPE = combinedEvals.get(p.fen);
      if (!parentPE || !childPE) continue;
      m.set(
        p.nodeId,
        classifyPlayedMove(
          { fen: p.parentFen, cp: parentPE.cp, secondCp: parentPE.secondCp, bestSan: parentPE.bestSan },
          { fen: p.fen, cp: childPE.cp },
        ),
      );
    }
    return m;
  }, [mainlinePositions, combinedEvals]);

  // Whole-game report card. Null until every reviewed position has an eval, so
  // accuracy/rating only appear once the background pass is complete.
  const reviewSummary = useMemo<GameReviewSummary | null>(() => {
    if (reviewFens.length < 3) return null;
    const positions: ReviewPosition[] = [];
    for (const fen of reviewFens) {
      const pe = combinedEvals.get(fen);
      if (pe) {
        positions.push({ fen, cp: pe.cp, secondCp: pe.secondCp, bestSan: pe.bestSan });
        continue;
      }
      // The engine can't score a terminal position (checkmate/stalemate), so it
      // never returns an eval for it. Fill it in directly, otherwise the report
      // card would never complete for a game that ended in mate.
      const g = new Chess(fen);
      let cp: number | null = null;
      if (g.isCheckmate()) cp = fen.split(" ")[1] === "w" ? -100000 : 100000;
      else if (g.isStalemate() || g.isInsufficientMaterial() || g.isDraw()) cp = 0;
      if (cp === null) return null; // genuinely not analyzed yet
      positions.push({ fen, cp, secondCp: null, bestSan: null });
    }
    return summarizeGame(positions);
  }, [reviewFens, combinedEvals]);

  // Surface the report to a parent (the review page renders the per-class
  // breakdown in its sidebar). Null until the background pass completes.
  useEffect(() => {
    onReviewSummary?.(reviewSummary);
  }, [reviewSummary, onReviewSummary]);
  // Position editor ("set up position"): a local working board that only syncs to
  // the partner on Apply, so they never see a half-built position. `editBrush` is
  // the selected palette piece ("wQ", ...), "trash" for the eraser, or null.
  const [editMode, setEditMode] = useState(false);
  const [editPosition, setEditPosition] = useState<EditorPosition>({});
  const [editBrush, setEditBrush] = useState<string | null>(null);
  const [editTurn, setEditTurn] = useState<"w" | "b">("w");
  const [editError, setEditError] = useState("");
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

  const onRemoteReset = useCallback(() => {
    isRemoteUpdateRef.current = true;
    const fresh = createTree();
    setTree(fresh);
    setCurrentNodeId(fresh.rootId);
    setArrows([]);
    setSelectedSquare(null);
    setHighlightedSquares({});
    setGameInfo(null);
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
    local,
    onRemoteMoves,
    onRemoteNavigate,
    onRemoteArrows,
    onRemoteHighlights,
    onRemoteReset,
  });

  // Mirror the latest tree in a ref so the mount-time self-heal can compare its
  // size against the persisted board without re-running on every move.
  const treeRef = useRef(tree);
  useEffect(() => { treeRef.current = tree; }, [tree]);

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
    if (game.isCheckmate()) return { text: `Checkmate - ${winner} wins`, tone: "over" };
    if (game.isStalemate()) return { text: "Stalemate - draw", tone: "over" };
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
    setReviewFens([]);
    setGameInfo(null);
    if (!isRemoteUpdateRef.current) broadcastReset();
  }, [broadcastReset]);

  const requestReset = useCallback(() => {
    if (!hasMoves) return; // Nothing to reset
    setShowResetConfirm(true);
  }, [hasMoves]);

  const toggleHints = useCallback(() => {
    // Coach-local: the engine is private to the coach, so this never syncs.
    setShowHints((v) => !v);
  }, []);

  // ---- Position editor ----
  // Seed the editor from whatever is currently on the board, so you can tweak an
  // existing position rather than always starting from scratch.
  const enterEditMode = useCallback(() => {
    setEditPosition(gameToEditorPosition(game));
    setEditTurn(game.turn());
    setEditBrush(null);
    setEditError("");
    setEditMode(true);
  }, [game]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setEditBrush(null);
    setEditError("");
  }, []);

  // Click a square: erase, stamp the selected piece, or toggle it off if the same
  // piece is already there. With no brush selected a click does nothing.
  function onEditSquareClick({ square, piece }: SquareHandlerArgs) {
    setEditError("");
    setEditPosition((prev) => {
      const next = { ...prev };
      if (editBrush === "trash") {
        if (piece) delete next[square];
      } else if (editBrush) {
        if (next[square]?.pieceType === editBrush) delete next[square];
        else next[square] = { pieceType: editBrush };
      }
      return next;
    });
  }

  // Drag a piece to relocate it; drag it off the board to remove it.
  function onEditPieceDrop({ sourceSquare, targetSquare, piece }: PieceDropHandlerArgs): boolean {
    setEditError("");
    setEditPosition((prev) => {
      const next = { ...prev };
      const moving = next[sourceSquare] ?? (piece ? { pieceType: piece.pieceType } : null);
      delete next[sourceSquare];
      if (targetSquare && moving) next[targetSquare] = moving;
      return next;
    });
    return true;
  }

  // Commit the edited position as a fresh board. chess.js validates the FEN (one
  // king per side, no back-rank pawns, ...); loadTreeFromFen syncs it to the
  // partner. On failure we keep the editor open and explain why.
  function applyEditPosition() {
    const fen = editorPositionToFen(editPosition, editTurn);
    if (loadTreeFromFen(fen)) {
      exitEditMode();
    } else {
      setEditError("This position can't be used. Each side needs exactly one king, and pawns can't sit on the first or last rank.");
    }
  }

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

  // Size the board to the largest square that fits the column's *visible* area:
  // its width (minus the eval bar) and its visible height (minus the move
  // controls we keep on-screen). We measure the scroll column itself - a box
  // whose size depends only on the window, not on the content inside it - so
  // the board keeps its size when the move list grows or the best-moves box
  // appears/disappears. Those flow below and the column scrolls to reach them.
  useEffect(() => {
    const root = containerRef.current;
    const col = root?.parentElement;
    if (!root || !col) return;
    const update = () => {
      const w = root.clientWidth - (showHints && engineEnabled ? EVAL_BAR_RESERVE : 0);
      const h = col.clientHeight - COLUMN_PADDING - BOARD_BOTTOM_RESERVE;
      setBoardPx(Math.max(MIN_BOARD, Math.floor(Math.min(w, h))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(col);
    return () => ro.disconnect();
  }, [showHints, engineEnabled]);

  // Dismiss the move context menu on any outside click.
  useEffect(() => {
    if (!moveMenu) return;
    const close = () => setMoveMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [moveMenu]);

  // Self-heal the board on (re)mount. The SSR props that seed this component can
  // be stale: after the lesson page's error boundary "Try again" - or a soft
  // navigation back into the room - React remounts the board with the *original*
  // payload from when the room first opened (an empty board), even though many
  // moves have since been persisted. Pull the authoritative tree from the server
  // and adopt it whenever it holds more moves than what we mounted with, so a
  // rejoining participant never returns to an empty board and then overwrites
  // their partner's history with the next move they make.
  useEffect(() => {
    if (local) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/lesson/${lessonId}/board`);
        if (!res.ok || cancelled) return;
        const body = await res.json();
        const serverTree = sanitizeTree(body.boardTree);
        if (!serverTree || cancelled) return;
        const localCount = Object.keys(treeRef.current.nodes).length;
        const serverCount = Object.keys(serverTree.nodes).length;
        if (serverCount <= localCount) return; // our board is the same or richer
        setTree(serverTree);
        setCurrentNodeId(endOfLine(serverTree, serverTree.rootId));
        setSelectedSquare(null);
      } catch {
        // Best-effort: the next live move broadcast resyncs the board anyway.
      }
    })();
    return () => { cancelled = true; };
  }, [lessonId, local]);

  // Keyboard arrow navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (editMode) return; // Editing the board, not navigating the line
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goForward(); }
      else if (e.key === "Home") { e.preventDefault(); goToStart(); }
      else if (e.key === "End") { e.preventDefault(); goToEnd(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goForward, goToStart, goToEnd, editMode]);

  function loadTreeFromPgn(pgn: string) {
    const nextTree = pgnToTree(pgn);
    const endId = endOfLine(nextTree, nextTree.rootId);
    // Pull player names/ratings from the PGN tags (pgnToTree keeps only moves).
    try {
      const meta = new Chess();
      meta.loadPgn(pgn);
      const h = meta.header() as Record<string, string>;
      const info = {
        white: h.White ?? "",
        black: h.Black ?? "",
        whiteElo: h.WhiteElo ?? "",
        blackElo: h.BlackElo ?? "",
        result: h.Result ?? "",
      };
      setGameInfo(info.white || info.black || info.whiteElo || info.blackElo ? info : null);
    } catch {
      setGameInfo(null);
    }
    setTree(nextTree);
    setCurrentNodeId(endId);
    setShowImport(false);
    setImportText("");
    setImportError("");
    // Queue the imported game for a background whole-game review (engine only).
    const ids = mainlineNodeIds(nextTree);
    setReviewFens(engineEnabled && ids.length > 2 ? ids.map((id) => fenAtNode(nextTree, id)) : []);
    if (!isRemoteUpdateRef.current) broadcastMoves(nextTree, endId);
  }

  function loadTreeFromFen(fen: string) {
    const nextTree = fenToTree(fen);
    if (!nextTree) return false;
    setTree(nextTree);
    setCurrentNodeId(nextTree.rootId);
    setShowImport(false);
    setImportText("");
    setImportError("");
    setGameInfo(null);
    if (!isRemoteUpdateRef.current) broadcastMoves(nextTree, nextTree.rootId);
    return true;
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

    // A single FEN line sets up an arbitrary starting position with no moves.
    if (loadTreeFromFen(text)) return;

    setImportError("Could not parse as PGN, FEN, or game link. Paste a valid PGN, FEN, or Lichess/Chess.com game link.");
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
      const cp = evalToCp(lines[0]);
      const secondCp = lines.length > 1 ? evalToCp(lines[1]) : null;
      const bestSan = lines[0].san[0] ?? null;
      setEvalCache((prev) => {
        const existing = prev.get(fen);
        if (existing && existing.cp === cp && existing.secondCp === secondCp && existing.bestSan === bestSan) {
          return prev;
        }
        const next = new Map(prev);
        next.set(fen, { cp, secondCp, bestSan });
        return next;
      });
    }
  }, []);

  // Engine arrows for the position currently displayed: bright green for the
  // best move, lighter green for any other line within ~2cp ("excellent").
  const currentFen = game.fen();
  const engineArrows = useMemo<Arrow[]>(() => {
    // Only draw for the position the lines actually belong to - never replay a
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

  // Classify a played move based on cached evals (parent vs node), using the
  // mainline continuation as the "next" position for sacrifice detection.
  const classifyMoveAtNode = useCallback((nodeId: string): MoveClass | null => {
    const node = tree.nodes[nodeId];
    if (!node || node.parentId === null) return null;
    const parentFen = fenAtNode(tree, node.parentId);
    const childFen = fenAtNode(tree, nodeId);
    const parentPE = combinedEvals.get(parentFen);
    const childPE = combinedEvals.get(childFen);
    if (!parentPE || !childPE) return null;
    return classifyPlayedMove(
      { fen: parentFen, cp: parentPE.cp, secondCp: parentPE.secondCp, bestSan: parentPE.bestSan },
      { fen: childFen, cp: childPE.cp },
    );
  }, [tree, combinedEvals]);

  // Destination/source squares of the move that produced the currently displayed
  // position - drives the on-board chess.com-style marker.
  const lastMove = useMemo(() => {
    if (atRoot) return null;
    const verbose = game.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    return last ? { from: last.from as string, to: last.to as string } : null;
  }, [game, atRoot]);

  const currentMoveClass = showHints && !atRoot ? classifyMoveAtNode(currentNodeId) : null;

  // Square size in px (board width / 8), so the corner badge scales with the board.
  const renderSquare: SquareRenderer = ({ square, children }) => {
    const isDest = lastMove?.to === square;
    const isFrom = lastMove?.from === square;
    const style: React.CSSProperties = {
      position: "relative",
      width: "100%",
      height: "100%",
      ...squareStyles[square],
    };
    if ((isDest || isFrom) && !squareStyles[square]?.backgroundColor) {
      // With the engine on, tint by move quality; otherwise fall back to a plain
      // chess.com-style yellow so the last move is always visible (whose turn it is).
      style.backgroundColor = currentMoveClass
        ? MOVE_CLASS_STYLE[currentMoveClass].tint
        : LAST_MOVE_TINT;
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
  function renderLine(startId: string, startPly: number, isMainline = true): React.ReactNode[] {
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

      // Move-quality marker (mainline only, when the engine is on): chess.com-style
      // color + glyph for every classified move (best/excellent/good through
      // blunder). Read from the memoized map so the list never replays the game.
      const cls = isMainline && showHints ? moveClasses.get(nodeId) ?? null : null;

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
          style={cls ? { color: MOVE_CLASS_STYLE[cls].badge } : undefined}
          title={cls ? MOVE_CLASS_STYLE[cls].label : undefined}
        >
          {prefix ? `${prefix} ${node.san}` : node.san}
          {cls ? ` ${MOVE_CLASS_STYLE[cls].symbol}` : ""}
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
              {renderLine(sibId, ply, false)}
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

  // A name/rating bar for one side, shown above/below the board when a PGN with
  // player tags was imported (chess.com-style). The swatch matches the piece color.
  function playerStrip(side: "white" | "black"): React.ReactNode {
    if (!gameInfo) return null;
    const name = side === "white" ? gameInfo.white : gameInfo.black;
    const elo = side === "white" ? gameInfo.whiteElo : gameInfo.blackElo;
    if (!name && !elo) return null;
    return (
      <div className="w-full flex items-center gap-2 px-1 text-sm">
        <span className={`inline-block h-3.5 w-3.5 rounded-sm border border-border ${side === "white" ? "bg-white" : "bg-zinc-800"}`} />
        <span className="font-medium truncate">{name || (side === "white" ? "White" : "Black")}</span>
        {elo ? <span className="text-xs text-muted-foreground">({elo})</span> : null}
      </div>
    );
  }

  // chess.com-style eval graph. White fills up from the BOTTOM and black is the
  // dark area at the TOP (matching the eval bar), with the boundary tracing each
  // position's win probability. The area/line live in a stretched SVG; the move
  // dots are HTML circles overlaid on top so they stay perfectly round (a
  // stretched SVG would squash <circle> into ovals) and clearly visible.
  function renderEvalGraph(graph: number[]): React.ReactNode {
    const n = graph.length;
    if (n < 2) return null;
    // SVG uses a 0..100 box stretched to fill; positions map to percentages.
    const xPct = (i: number) => (i / (n - 1)) * 100;
    const yPct = (cp: number) => (1 - cpToExpectedPoints(cp)) * 100;
    const curvePts = graph.map((cp, i) => `${xPct(i).toFixed(2)},${yPct(cp).toFixed(2)}`);
    const whiteArea = `M0,100 L ${curvePts.join(" L ")} L100,100 Z`;
    const curIdx = mainlineIds.indexOf(currentNodeId);
    // Only the notable classes get a dot (chess.com leaves best/good moves bare).
    const DOTTED: Partial<Record<MoveClass, boolean>> = {
      brilliant: true,
      great: true,
      inaccuracy: true,
      miss: true,
      mistake: true,
      blunder: true,
    };
    return (
      <div className="relative w-full h-20 rounded overflow-hidden bg-zinc-900">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {/* Black is the dark background (top); white fills up from the bottom. */}
          <path d={whiteArea} fill="#f4f4f5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(120,120,120,0.8)" strokeWidth="0.4" strokeDasharray="2 2" />
          {curIdx >= 0 && (
            <line x1={xPct(curIdx)} y1="0" x2={xPct(curIdx)} y2="100" stroke="#f7c631" strokeWidth="0.5" />
          )}
        </svg>
        {/* Round, solid move dots overlaid in HTML so they never distort. */}
        {graph.map((cp, i) => {
          if (i === 0) return null;
          const cls = moveClasses.get(mainlineIds[i]);
          if (!cls || !DOTTED[cls]) return null;
          return (
            <span
              key={`dot-${i}`}
              title={MOVE_CLASS_STYLE[cls].label}
              className="absolute rounded-full"
              style={{
                left: `${xPct(i)}%`,
                top: `${yPct(cp)}%`,
                width: 9,
                height: 9,
                transform: "translate(-50%, -50%)",
                background: MOVE_CLASS_STYLE[cls].badge,
                border: "1.5px solid #fff",
                boxShadow: "0 0 2px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            />
          );
        })}
        {/* Click anywhere along the width to jump to that move. */}
        <div className="absolute inset-0 flex">
          {graph.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to move ${i}`}
              className="flex-1 h-full cursor-pointer"
              onClick={() => mainlineIds[i] && navigateTo(mainlineIds[i])}
            />
          ))}
        </div>
      </div>
    );
  }

  // Small move-quality badge that matches the one drawn on the board (same
  // colors, glyph, and icon), so the move list and board read the same.
  function moveBadge(cls: MoveClass): React.ReactNode {
    const Icon = MOVE_CLASS_STYLE[cls].icon;
    return (
      <span
        title={MOVE_CLASS_STYLE[cls].label}
        className="inline-flex items-center justify-center rounded-full text-white shrink-0"
        style={{
          background: MOVE_CLASS_STYLE[cls].badge,
          width: 17,
          height: 17,
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1,
          border: "1px solid rgba(255,255,255,0.85)",
        }}
      >
        {Icon ? <Icon size={11} strokeWidth={2.5} fill="#fff" /> : MOVE_CLASS_STYLE[cls].symbol}
      </span>
    );
  }

  function moveButton(nodeId: string, node: MoveNode, isMainline: boolean): React.ReactNode {
    const isActive = nodeId === currentNodeId;
    const cls = isMainline && showHints ? moveClasses.get(nodeId) ?? null : null;
    return (
      <button
        key={nodeId}
        type="button"
        onClick={() => navigateTo(nodeId)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMoveMenu({ nodeId, x: e.clientX, y: e.clientY });
        }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
          isActive ? "bg-primary/20 font-bold" : "hover:bg-muted"
        }`}
        style={cls ? { color: MOVE_CLASS_STYLE[cls].badge } : undefined}
      >
        <span>{node.san}</span>
        {cls && moveBadge(cls)}
      </button>
    );
  }

  // Mainline as chess.com-style paired rows: "1. e4 e5", "2. Nf3 Nc6", with each
  // move carrying its quality badge. Variations break onto their own indented
  // rows (rendered flat via renderLine).
  function renderMainline(): React.ReactNode {
    const rows: React.ReactNode[] = [];
    let cur: string | null = mainlineStart;
    let ply = 1;
    let rowItems: React.ReactNode[] = [];
    let rowKey = 0;
    const numCell = (label: string, id: string) => (
      <span key={`n${id}`} className="w-7 shrink-0 text-right text-muted-foreground tabular-nums">
        {label}
      </span>
    );
    const flush = () => {
      if (rowItems.length) {
        rows.push(
          <div key={`r${rowKey++}`} className="flex items-center gap-1">
            {rowItems}
          </div>
        );
        rowItems = [];
      }
    };
    while (cur) {
      const nodeId: string = cur;
      const node: MoveNode | undefined = tree.nodes[nodeId];
      if (!node) break;
      const isWhite = ply % 2 === 1;
      const moveNum = Math.ceil(ply / 2);
      if (isWhite) {
        flush();
        rowItems.push(numCell(`${moveNum}.`, nodeId));
        rowItems.push(moveButton(nodeId, node, true));
      } else {
        if (rowItems.length === 0) rowItems.push(numCell(`${moveNum}…`, nodeId));
        rowItems.push(moveButton(nodeId, node, true));
      }

      // Variation siblings: alternatives to this mainline move, on their own rows.
      const parent = node.parentId ? tree.nodes[node.parentId] : null;
      if (parent && parent.children[0] === nodeId && parent.children.length > 1) {
        flush();
        for (const sibId of parent.children.slice(1)) {
          rows.push(
            <div
              key={`var-${sibId}`}
              className="ml-7 pl-2 border-l border-border text-xs text-muted-foreground [&>button]:mr-1"
            >
              <span className="mr-0.5">(</span>
              {renderLine(sibId, ply, false)}
              <span className="ml-0.5">)</span>
            </div>
          );
        }
      }

      cur = node.children[0] ?? null;
      ply++;
    }
    flush();
    return <div className="space-y-0.5">{rows}</div>;
  }

  // Engine + manual/remote arrows, deduped by square pair. react-chessboard keys
  // arrows solely by start+end square; any duplicate (e.g. an engine arrow that
  // coincides with a drawn one) collides and leaves ghost arrows React can't
  // reconcile away - so collapse them to one here.
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
    <div ref={containerRef} className="flex flex-col items-center gap-2 w-full max-w-[600px]" tabIndex={-1}>
      {editMode && (
        <div className="flex flex-col items-center gap-2 w-full">
          {/* Editor board: free placement, no legality. Click a palette piece then
              squares to stamp it; drag pieces to move them, or off-board to remove. */}
          <div className="relative aspect-square shrink-0" style={{ width: boardPx || undefined, height: boardPx || undefined }}>
            <Chessboard
              options={{
                id: "position-editor",
                position: editPosition,
                onSquareClick: onEditSquareClick,
                onPieceDrop: onEditPieceDrop,
                boardOrientation: boardOrientation,
                allowDragOffBoard: true,
                allowDrawingArrows: false,
                showAnimations: false,
              }}
            />
          </div>

          {/* Palette + tools */}
          <div className="w-full rounded-md border bg-muted/50 p-2 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground text-center">
              {editBrush === "trash"
                ? "Eraser selected - click pieces to remove them"
                : editBrush
                ? `Placing ${PIECE_NAMES[editBrush[1]]} - click squares to add it`
                : "Pick a piece, then click squares to place it"}
            </p>
            {(["w", "b"] as const).map((color) => (
              <div key={color} className="flex items-center gap-1 justify-center">
                {EDITOR_PIECE_TYPES.map((t) => {
                  const pt = `${color}${t}`;
                  const active = editBrush === pt;
                  return (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setEditBrush(active ? null : pt)}
                      className={`h-10 w-10 rounded p-0.5 transition-colors ring-1 ring-black/10 ${active ? "bg-neutral-200 ring-2 ring-primary" : "bg-neutral-200/90 hover:bg-neutral-100"}`}
                      title={`Place ${color === "w" ? "white" : "black"} ${PIECE_NAMES[t]}`}
                    >
                      {defaultPieces[pt]?.({ svgStyle: { width: "100%", height: "100%" } })}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
              <Button type="button" size="sm" variant={editBrush === "trash" ? "default" : "outline"} onClick={() => setEditBrush(editBrush === "trash" ? null : "trash")} title="Eraser: click squares to remove pieces">
                <Trash2 className="h-4 w-4 mr-1" /> Erase
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setEditPosition({}); setEditError(""); }}>
                Clear board
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setEditPosition(gameToEditorPosition(new Chess())); setEditError(""); }}>
                Start position
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setBoardOrientation((o) => (o === "white" ? "black" : "white"))} title="Flip board">
                <ArrowDownUp className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground">Side to move:</span>
              <div className="inline-flex rounded-md border overflow-hidden">
                <button type="button" onClick={() => setEditTurn("w")} className={`px-3 py-1 text-sm ${editTurn === "w" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>White</button>
                <button type="button" onClick={() => setEditTurn("b")} className={`px-3 py-1 text-sm ${editTurn === "b" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>Black</button>
              </div>
            </div>
          </div>

          {editError && <p className="w-full text-sm text-destructive text-center">{editError}</p>}

          <div className="flex items-center justify-end gap-2 w-full">
            <Button type="button" variant="ghost" onClick={exitEditMode}>Cancel</Button>
            <Button type="button" onClick={applyEditPosition}>Set up position</Button>
          </div>
        </div>
      )}

      {!editMode && (<>
      {/* Whole-game review report card: sits above the board so the progress bar
          and results are visible without scrolling. Runs in the background after
          a game is imported. */}
      {engineEnabled && reviewFens.length > 2 && (
        <div className="w-full rounded border bg-muted/30 p-2 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Game review</p>
            {review.running && (
              <span className="text-xs text-muted-foreground">
                Analyzing {review.done}/{review.total}…
              </span>
            )}
          </div>
          {review.running && (
            <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${review.total ? (review.done / review.total) * 100 : 0}%` }}
              />
            </div>
          )}
          {reviewSummary && (
            <>
              <div className="grid grid-cols-2 gap-2 text-center">
                {([
                  { key: "white", label: "White", side: reviewSummary.white, name: gameInfo?.white, elo: gameInfo?.whiteElo },
                  { key: "black", label: "Black", side: reviewSummary.black, name: gameInfo?.black, elo: gameInfo?.blackElo },
                ] as const).map(({ key, label, side, name, elo }) => (
                  <div key={key} className="rounded border p-2">
                    <p className="text-[11px] font-medium truncate" title={name || label}>
                      {name || label}
                      {elo ? <span className="text-muted-foreground"> ({elo})</span> : null}
                    </p>
                    <p className="text-xl font-bold leading-tight">{side.accuracy}%</p>
                    <p className="text-[11px] text-muted-foreground">accuracy</p>
                    <p className="text-xs mt-0.5">~{side.estRating} est. rating</p>
                  </div>
                ))}
              </div>

              {renderEvalGraph(reviewSummary.graph)}
              <p className="text-[10px] text-muted-foreground">
                Accuracy and estimated rating are approximate.
              </p>
            </>
          )}
        </div>
      )}

      {/* Board + Eval Bar. The eval bar is part of the engine-hint bundle, so the
          lightbulb gates it alongside the arrows, line list, and classifications -
          unmounting it also stops the Stockfish worker while hints are off.
          Fixed height (shrink-0): the board is sized to the measured square
          (boardPx) from the column, not from leftover flex space, so it never
          resizes when the content below changes. */}
      {/* Player at the top of the board (the side opposite the orientation). */}
      {playerStrip(boardOrientation === "white" ? "black" : "white")}
      <div className="flex gap-1 w-full shrink-0 items-start justify-center">
        {showHints && engineEnabled && (
          <EvalBar fen={game.fen()} boardOrientation={boardOrientation} onLinesChange={handleLines} heightPx={boardPx > 0 ? boardPx : undefined} multiPv={evalMultiPv} moveTimeMs={evalMoveTimeMs} paused={review.running} />
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
              // Animate piece slides only when the board can't be hidden. On
              // mobile the board lives in a `display:none` tab while Chat is
              // open; a move arriving then makes react-chessboard measure a
              // zero-width square mid-animation and throw "Square width not
              // found", crashing the whole lesson room. Snapping instantly on
              // phones avoids that measurement entirely.
              showAnimations: !isMobile,
              allowDrawingArrows: true,
              clearArrowsOnClick: true,
              clearArrowsOnPositionChange: true,
              onArrowsChange: handleArrowsChange,
            }}
          />
          {renderPromotionPicker()}
        </div>
      </div>
      {/* Player at the bottom of the board (matches the orientation). */}
      {playerStrip(boardOrientation === "white" ? "white" : "black")}

      {/* Game status - check / checkmate / stalemate / draws (incl. repetition) */}
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
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowImport(!showImport)} title="Upload PGN, FEN, or game link">
          <Upload className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-9 px-2.5 text-xs font-medium" onClick={enterEditMode} title="Set up a position (place pieces by hand)">
          Set up
        </Button>
        {engineEnabled && (
          <Button
            variant={showHints ? "default" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={toggleHints}
            title={showHints ? "Hide engine hints (eval bar, best moves & move ratings)" : "Show engine hints (eval bar, best moves & move ratings)"}
          >
            <Lightbulb className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Shared-board reassurance. Only in a real lesson - in practice mode the
          board is yours alone, so the note would be misleading. */}
      {!local && (
        <p className="w-full text-center text-xs text-muted-foreground">
          Your moves, arrows, and highlights are shared live with your {isCoach ? "student" : "coach"}.
        </p>
      )}

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

      {/* Move list - main line plus indented variations; right-click a move for
          promote / delete. Past moves sit above the engine's best moves. These
          flow normally and the board column scrolls to reach them, so they
          never change the board's size. */}
      {mainlineStart && (
        <div className="w-full rounded border bg-muted/30 p-2">
          <div className="text-sm font-mono leading-relaxed">
            {renderMainline()}
          </div>
        </div>
      )}

      {/* Top engine lines - eval + principal variation for each (hidden when hints off) */}
      {showHints && engineLines.length > 0 && engineLinesFen === currentFen && (
        <div className="w-full rounded border bg-muted/30 p-2 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            Best engine moves <span className="font-normal">· Stockfish 18 (~3600 Elo)</span>
          </p>
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

      {/* Import panel - fixed overlay so it doesn't push board around */}
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
              Paste a PGN, a FEN, or a Lichess / Chess.com game link:
            </p>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="1. e4 e5 2. Nf3... or rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b ... or https://lichess.org/..."
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
      </>)}
    </div>
  );
}
