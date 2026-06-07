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
}

const MULTI_PV = 5;
const MOVE_TIME_MS = 500;

// chess.com's win-probability constant. Maps a centipawn eval to a 0..1 win
// chance via a logistic curve — steep near 0 (small edges shift the bar a lot)
// and flattening at large advantages (+4 vs +7 barely differ), just like
// chess.com. Replaces a naive linear fill that moved too little near 0 and too
// much at the extremes.
const WIN_PROB_K = 0.00368208;

export function EvalBar({ fen, boardOrientation, onLinesChange, heightPx }: Props) {
  const workerRef = useRef<Worker | null>(null);
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

  useEffect(() => {
    let terminated = false;
    const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
    workerRef.current = worker;

    worker.onerror = () => {
      if (!terminated) setIsReady(false);
    };

    worker.onmessage = (e: MessageEvent) => {
      if (terminated) return;
      const line = typeof e.data === "string" ? e.data : e.data?.data;
      if (!line || typeof line !== "string") return;

      if (line.includes("uciok")) {
        worker.postMessage("setoption name Threads value 1");
        worker.postMessage("setoption name Hash value 16");
        worker.postMessage(`setoption name MultiPV value ${MULTI_PV}`);
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

        if (depthMatch) setDepth(parseInt(depthMatch[1], 10));

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

        // Emit top-N lines (convert UCI moves to SAN) — throttled by React state
        if (onLinesChange) {
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
          onLinesChange(converted, depthMatch ? parseInt(depthMatch[1], 10) : 0, activeFenRef.current);
        }
      }

      if (line.startsWith("bestmove")) {
        isAnalyzingRef.current = false;
        const next = pendingFenRef.current;
        if (next) {
          pendingFenRef.current = null;
          activeFenRef.current = next;
          activeTurnRef.current = next.split(" ")[1] === "b" ? "b" : "w";
          isAnalyzingRef.current = true;
          linesRef.current = {};
          worker.postMessage(`position fen ${next}`);
          worker.postMessage(`go movetime ${MOVE_TIME_MS}`);
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
    if (!worker || !isReady) return;

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
      worker.postMessage(`go movetime ${MOVE_TIME_MS}`);
    }
  }, [isReady]);

  useEffect(() => {
    if (!fen || !isReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      analyze(fen);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fen, isReady, analyze]);

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

  return (
    <div
      className="relative w-7 shrink-0 min-h-[120px] rounded-sm overflow-hidden border border-border bg-zinc-800 select-none"
      style={{ height: heightPx ?? "100%" }}
    >
      {/* White's portion — anchored to whichever end White is on. */}
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
