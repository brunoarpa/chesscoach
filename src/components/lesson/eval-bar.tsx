"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  fen: string;
  boardOrientation: "white" | "black";
}

export function EvalBar({ fen, boardOrientation }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const [evaluation, setEvaluation] = useState<number>(0); // in centipawns
  const [mate, setMate] = useState<number | null>(null);
  const [bestLine, setBestLine] = useState<string>("");
  const [depth, setDepth] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentFenRef = useRef<string>("");

  useEffect(() => {
    let terminated = false;
    // Load Stockfish from self-hosted files in /public/stockfish/
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
        worker.postMessage("isready");
      }
      if (line.includes("readyok")) {
        setIsReady(true);
      }
      if (line.startsWith("info") && line.includes("score")) {
        const depthMatch = line.match(/depth (\d+)/);
        const cpMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        const pvMatch = line.match(/ pv (.+)/);

        if (depthMatch) setDepth(parseInt(depthMatch[1]));

        if (mateMatch) {
          setMate(parseInt(mateMatch[1]));
          setEvaluation(parseInt(mateMatch[1]) > 0 ? 10000 : -10000);
        } else if (cpMatch) {
          setMate(null);
          setEvaluation(parseInt(cpMatch[1]));
        }

        if (pvMatch) setBestLine(pvMatch[1].split(" ").slice(0, 5).join(" "));
      }
    };

    worker.postMessage("uci");
    return () => {
      terminated = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const analyze = useCallback((position: string) => {
    const worker = workerRef.current;
    if (!worker || !isReady) return;
    currentFenRef.current = position;
    worker.postMessage("stop");
    worker.postMessage("ucinewgame");
    worker.postMessage(`position fen ${position}`);
    worker.postMessage("go depth 18");
  }, [isReady]);

  useEffect(() => {
    if (!fen || !isReady) return;
    // Debounce rapid position changes (e.g. clicking through moves quickly)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      analyze(fen);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fen, isReady, analyze]);

  // Calculate bar percentage (from white's perspective)
  const clampedEval = Math.max(-1000, Math.min(1000, evaluation));
  const whitePercent = 50 + (clampedEval / 1000) * 50;
  const displayPercent = boardOrientation === "white" ? whitePercent : 100 - whitePercent;

  const evalText = mate !== null
    ? `M${Math.abs(mate)}`
    : `${evaluation >= 0 ? "+" : ""}${(evaluation / 100).toFixed(1)}`;

  const isWhiteAdvantage = evaluation > 0;

  return (
    <div className="flex flex-col items-center gap-0.5 h-full select-none">
      {/* Eval number */}
      <div className="text-[10px] font-mono font-bold leading-none">
        {evalText}
      </div>

      {/* Vertical bar */}
      <div className="relative w-6 flex-1 rounded-sm overflow-hidden border border-border bg-zinc-800 min-h-[200px]">
        {/* White portion (from bottom) */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-300 ease-out"
          style={{ height: `${displayPercent}%` }}
        />
        {/* Black portion is just the dark background */}
      </div>

      {/* Depth */}
      <div className="text-[9px] text-muted-foreground font-mono leading-none">
        d{depth}
      </div>
    </div>
  );
}
