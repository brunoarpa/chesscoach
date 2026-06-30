"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js";

interface Line {
  rank: number;       // 1..5
  cp: number | null;  // centipawns, white perspective
  mate: number | null; // mate-in-N, white perspective
  san: string[];      // SAN move sequence
}

interface Props {
  fen: string;
  boardOrientation: "white" | "black";
  onLinesChange?: (lines: Line[], depth: number, fen: string) => void;
  // Explicit pixel height so the bar always matches the board. The board sizes
  // itself internally, so relying on flex stretch collapses the bar to its
  // min-height; the parent passes the measured board size instead.
  heightPx?: number;
  // Engine load knobs. Phones get fewer lines and a shorter search so the live
  // bar plus the background game review don't peg a weak CPU.
  multiPv?: number;
  moveTimeMs?: number;
  // Suspend searching without unmounting. Used to guarantee only one engine
  // searches at a time on mobile (the background review takes priority).
  paused?: boolean;
  // Render a horizontal bar (above the board) instead of the vertical one beside
  // it - used on phones in review, chess.com-style. `widthPx` matches the board.
  horizontal?: boolean;
  widthPx?: number;
}

const MULTI_PV = 5;
const MOVE_TIME_MS = 500;

// Cap how often we push engine lines up to the parent. Stockfish emits info
// lines extremely fast in simple/endgame positions (it races to very high
// depth), and each push re-renders the whole board - which caused lag and
// stuttering piece animations near the end of a game. We rate-limit the push
// and always flush a final time when the search settles.
const LINES_EMIT_THROTTLE_MS = 120;

// chess.com's win-probability constant. Maps a centipawn eval to a 0..1 win
// chance via a logistic curve - steep near 0 (small edges shift the bar a lot)
// and flattening at large advantages (+4 vs +7 barely differ), just like
// chess.com. Replaces a naive linear fill that moved too little near 0 and too
// much at the extremes.
const WIN_PROB_K = 0.00368208;

export function EvalBar({ fen, boardOrientation, onLinesChange, heightPx, multiPv = MULTI_PV, moveTimeMs = MOVE_TIME_MS, paused = false, horizontal = false, widthPx }: Props) {
  const workerRef = useRef<Worker | null>(null);
  // Read inside the worker callbacks, which are set up once; refs keep them
  // current without re-spawning the worker when the props change.
  const multiPvRef = useRef(multiPv);
  const moveTimeRef = useRef(moveTimeMs);
  const pausedRef = useRef(paused);
  multiPvRef.current = multiPv;
  moveTimeRef.current = moveTimeMs;
  pausedRef.current = paused;
  const [evaluation, setEvaluation] = useState<number>(0); // in centipawns
  const [mate, setMate] = useState<number | null>(null);
  const [depth, setDepth] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFenRef = useRef<string | null>(null);
  const activeFenRef = useRef<string>("");
  const activeTurnRef = useRef<"w" | "b">("w");
  const isAnalyzingRef = useRef(false);
  const linesRef = useRef<Record<number, { cp: number | null; mate: number | null; pv: string[] }>>({});
  const lastEmitRef = useRef(0);
  const lastDepthRef = useRef(0);

  useEffect(() => {
    let terminated = false;
    const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
    workerRef.current = worker;

    worker.onerror = () => {
      if (!terminated) setIsReady(false);
    };

    // Convert the accumulated PV lines to SAN and hand them to the parent.
    const emitLines = (curDepth: number) => {
      if (!onLinesChange) return;
      lastEmitRef.current = performance.now();
      const sorted = Object.entries(linesRef.current)
        .map(([k, v]) => ({ rank: parseInt(k, 10), ...v }))
        .sort((a, b) => a.rank - b.rank);
      const converted: Line[] = sorted.map((l) => {
        // Convert UCI moves to SAN
        const game = new Chess(activeFenRef.current);
        const san: string[] = [];
        for (const uci of l.pv) {
          try {
            const mv = game.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
            });
            if (mv) san.push(mv.san);
            else break;
          } catch {
            break;
          }
        }
        return { rank: l.rank, cp: l.cp, mate: l.mate, san };
      });
      onLinesChange(converted, curDepth, activeFenRef.current);
    };

    worker.onmessage = (e: MessageEvent) => {
      if (terminated) return;
      const line = typeof e.data === "string" ? e.data : e.data?.data;
      if (!line || typeof line !== "string") return;

      if (line.includes("uciok")) {
        worker.postMessage("setoption name Threads value 1");
        worker.postMessage("setoption name Hash value 16");
        worker.postMessage(`setoption name MultiPV value ${multiPvRef.current}`);
        worker.postMessage("isready");
      }
      if (line.includes("readyok")) {
        setIsReady(true);
      }
      if (line.startsWith("info") && line.includes("score") && line.includes(" pv ")) {
        const depthMatch = line.match(/depth (\d+)/);
        const multiPvMatch = line.match(/multipv (\d+)/);
        const cpMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        const pvMatch = line.match(/ pv (.+?)(?:\s+bmc|\s+bs|$)/);
        const perspective = activeTurnRef.current === "w" ? 1 : -1;

        const curDepth = depthMatch ? parseInt(depthMatch[1], 10) : lastDepthRef.current;
        lastDepthRef.current = curDepth;
        if (depthMatch) setDepth(curDepth);

        const pvIdx = multiPvMatch ? parseInt(multiPvMatch[1], 10) : 1;
        const pvMoves = pvMatch ? pvMatch[1].trim().split(/\s+/).slice(0, 5) : [];

        let lineCp: number | null = null;
        let lineMate: number | null = null;
        if (mateMatch) {
          const sideToMoveMate = parseInt(mateMatch[1], 10);
          lineMate = sideToMoveMate * perspective;
        } else if (cpMatch) {
          const sideToMoveCp = parseInt(cpMatch[1], 10);
          lineCp = sideToMoveCp * perspective;
        }

        linesRef.current[pvIdx] = { cp: lineCp, mate: lineMate, pv: pvMoves };

        // The principal variation (multipv 1) drives the bar
        if (pvIdx === 1) {
          if (lineMate !== null) {
            setMate(lineMate);
            setEvaluation(lineMate > 0 ? 10000 : -10000);
          } else if (lineCp !== null) {
            setMate(null);
            setEvaluation(lineCp);
          }
        }

        // Push lines to the parent, but rate-limited so a flood of info lines
        // doesn't re-render the board dozens of times a second.
        if (performance.now() - lastEmitRef.current >= LINES_EMIT_THROTTLE_MS) {
          emitLines(curDepth);
        }
      }

      if (line.startsWith("bestmove")) {
        isAnalyzingRef.current = false;
        emitLines(lastDepthRef.current); // flush the final, complete lines
        const next = pendingFenRef.current;
        if (next) {
          pendingFenRef.current = null;
          activeFenRef.current = next;
          activeTurnRef.current = next.split(" ")[1] === "b" ? "b" : "w";
          isAnalyzingRef.current = true;
          linesRef.current = {};
          worker.postMessage(`position fen ${next}`);
          worker.postMessage(`go movetime ${moveTimeRef.current}`);
        }
      }
    };

    worker.postMessage("uci");
    return () => {
      terminated = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      worker.terminate();
      workerRef.current = null;
      isAnalyzingRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = useCallback((position: string) => {
    const worker = workerRef.current;
    if (!worker || !isReady || pausedRef.current) return;

    pendingFenRef.current = position;

    if (isAnalyzingRef.current) {
      worker.postMessage("stop");
    } else {
      const next = pendingFenRef.current;
      pendingFenRef.current = null;
      if (!next || next === activeFenRef.current) return;
      activeFenRef.current = next;
      activeTurnRef.current = next.split(" ")[1] === "b" ? "b" : "w";
      isAnalyzingRef.current = true;
      linesRef.current = {};
      worker.postMessage(`position fen ${next}`);
      worker.postMessage(`go movetime ${moveTimeRef.current}`);
    }
  }, [isReady]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Paused (e.g. on mobile while the background game review is running): stop
    // any in-flight search so two engines never search at once, and wait. When
    // `paused` flips back to false this effect re-runs and analyzes the current
    // position.
    if (paused) {
      workerRef.current?.postMessage("stop");
      return;
    }
    if (!fen || !isReady) return;
    debounceRef.current = setTimeout(() => {
      analyze(fen);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fen, isReady, analyze, paused]);

  // White's share of the bar via the logistic win-probability curve. Mate is
  // pinned to a full bar for the mating side.
  const whitePercent = mate !== null
    ? (mate > 0 ? 100 : 0)
    : 100 / (1 + Math.exp(-WIN_PROB_K * evaluation));

  // White sits at the bottom unless the board is flipped.
  const whiteAtBottom = boardOrientation === "white";

  // Who's ahead, the magnitude to print, and which end / color the number takes.
  const leaderIsWhite = mate !== null ? mate > 0 : evaluation >= 0;
  const evalMagnitude = mate !== null
    ? `M${Math.abs(mate)}`
    : Math.abs(evaluation / 100).toFixed(1);
  // The number sits at the leading side's end of the bar (chess.com style).
  const leaderAtBottom = leaderIsWhite ? whiteAtBottom : !whiteAtBottom;

  // Horizontal bar (phone, above the board): the vertical bar rotated - white
  // sits on the right (board not flipped), black on the left, number at the
  // leader's end. chess.com-style.
  if (horizontal) {
    const whiteAtRight = boardOrientation === "white";
    const leaderAtRight = leaderIsWhite ? whiteAtRight : !whiteAtRight;
    return (
      <div
        className="relative h-5 w-full rounded-sm overflow-hidden border border-border bg-zinc-800 select-none"
        style={{ width: widthPx ?? "100%" }}
      >
        <div
          className="absolute top-0 bottom-0 bg-white transition-all duration-300 ease-out"
          style={{ width: `${whitePercent}%`, ...(whiteAtRight ? { right: 0 } : { left: 0 }) }}
        />
        <div
          className={`absolute top-0 bottom-0 flex items-center px-1.5 text-[10px] font-mono font-bold leading-none ${
            leaderIsWhite ? "text-zinc-900" : "text-white"
          }`}
          style={{ [leaderAtRight ? "right" : "left"]: 0 }}
        >
          {evalMagnitude}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-7 shrink-0 min-h-[120px] rounded-sm overflow-hidden border border-border bg-zinc-800 select-none"
      style={{ height: heightPx ?? "100%" }}
    >
      {/* White's portion - anchored to whichever end White is on. */}
      <div
        className="absolute left-0 right-0 bg-white transition-all duration-300 ease-out"
        style={{ height: `${whitePercent}%`, ...(whiteAtBottom ? { bottom: 0 } : { top: 0 }) }}
      />

      {/* Eval number, inside the bar on the leader's side, contrasting color. */}
      <div
        className={`absolute left-0 right-0 text-center text-[10px] font-mono font-bold leading-none ${
          leaderIsWhite ? "text-zinc-900" : "text-white"
        }`}
        style={{ [leaderAtBottom ? "bottom" : "top"]: 2 }}
      >
        {evalMagnitude}
      </div>

      {/* Search depth, faint, at the opposite end. */}
      <div
        className={`absolute left-0 right-0 text-center text-[8px] font-mono leading-none ${
          leaderIsWhite ? "text-white/50" : "text-zinc-900/50"
        }`}
        style={{ [leaderAtBottom ? "top" : "bottom"]: 2 }}
      >
        {depth > 0 ? depth : ""}
      </div>
    </div>
  );
}

export type { Line as EngineLine };
