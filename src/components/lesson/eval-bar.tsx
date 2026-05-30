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
}

const MULTI_PV = 5;
const MOVE_TIME_MS = 500;

export function EvalBar({ fen, boardOrientation, onLinesChange }: Props) {
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

  const clampedEval = Math.max(-1000, Math.min(1000, evaluation));
  const whitePercent = 50 + (clampedEval / 1000) * 50;
  const displayPercent = boardOrientation === "white" ? whitePercent : 100 - whitePercent;

  const evalText = mate !== null
    ? `M${Math.abs(mate)}`
    : `${evaluation >= 0 ? "+" : ""}${(evaluation / 100).toFixed(1)}`;

  return (
    <div className="flex flex-col items-center gap-1 h-full select-none">
      <div className="text-xs font-mono font-bold leading-none">
        {evalText}
      </div>

      <div className="relative w-7 flex-1 rounded-sm overflow-hidden border border-border bg-zinc-800 min-h-[200px]">
        <div
          className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-300 ease-out"
          style={{ height: `${displayPercent}%` }}
        />
      </div>

      <div className="text-[10px] text-muted-foreground font-mono leading-none">
        d{depth}
      </div>
    </div>
  );
}

export type { Line as EngineLine };
