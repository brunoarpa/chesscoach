"use client";

import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import type { PosEval } from "@/lib/game-review";

export interface GameReviewState {
  // FEN -> engine read-out (best eval, 2nd-best eval, best move), white
  // perspective. Filled as analysis runs.
  evals: Map<string, PosEval>;
  done: number;
  total: number;
  running: boolean;
}

const EMPTY: GameReviewState = { evals: new Map(), done: 0, total: 0, running: false };

// Runs Stockfish over a fixed list of positions in the background (one at a
// time, shallow fixed-time search) so the whole game gets evaluated while the
// user is free to explore the board. Re-runs whenever the position list changes.
//
// Uses MultiPV 2 so each position yields both the best move (eval + SAN) and the
// second-best move's eval - the extra line is what lets us tell "the only good
// move" (a Great move) apart from a position with many equally fine options.
export function useGameReview(
  fens: string[],
  enabled: boolean,
  moveTimeMs: number,
): GameReviewState {
  const [state, setState] = useState<GameReviewState>(EMPTY);

  // The fen list identity changes every render; key off content so the effect
  // only restarts when the actual game changes.
  const key = fens.join("|");

  useEffect(() => {
    if (!enabled || fens.length === 0) {
      setState(EMPTY);
      return;
    }

    let terminated = false;
    const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
    const localEvals = new Map<string, PosEval>();
    let idx = 0;
    let started = false;
    // Per-position accumulators (white perspective), reset before each search.
    let bestCp: number | null = null;
    let secondCp: number | null = null;
    let bestUci: string | null = null;

    setState({ evals: new Map(), done: 0, total: fens.length, running: true });

    const analyzeNext = () => {
      if (terminated) return;
      if (idx >= fens.length) {
        setState((s) => ({ ...s, running: false }));
        return;
      }
      bestCp = null;
      secondCp = null;
      bestUci = null;
      worker.postMessage(`position fen ${fens[idx]}`);
      worker.postMessage(`go movetime ${moveTimeMs}`);
    };

    worker.onerror = () => {
      if (!terminated) setState((s) => ({ ...s, running: false }));
    };

    // Convert the best move (UCI) to SAN in the position it was searched from.
    const bestSanFor = (fen: string): string | null => {
      if (!bestUci) return null;
      try {
        const g = new Chess(fen);
        const mv = g.move({
          from: bestUci.slice(0, 2),
          to: bestUci.slice(2, 4),
          promotion: bestUci.length > 4 ? bestUci.slice(4, 5) : undefined,
        });
        return mv ? mv.san : null;
      } catch {
        return null;
      }
    };

    worker.onmessage = (e: MessageEvent) => {
      if (terminated) return;
      const line = typeof e.data === "string" ? e.data : e.data?.data;
      if (typeof line !== "string") return;

      if (line.includes("uciok")) {
        worker.postMessage("setoption name MultiPV value 2");
        worker.postMessage("isready");
      } else if (line.includes("readyok")) {
        if (!started) {
          started = true;
          analyzeNext();
        }
      } else if (line.startsWith("info") && line.includes("score") && line.includes(" pv ")) {
        // Engine reports relative to the side to move; convert to white perspective.
        const fen = fens[idx];
        const turn = fen.split(" ")[1] === "b" ? -1 : 1;
        const pvIdx = line.match(/multipv (\d+)/);
        const rank = pvIdx ? parseInt(pvIdx[1], 10) : 1;
        const mateMatch = line.match(/score mate (-?\d+)/);
        const cpMatch = line.match(/score cp (-?\d+)/);
        let cp: number | null = null;
        if (mateMatch) cp = (parseInt(mateMatch[1], 10) > 0 ? 100000 : -100000) * turn;
        else if (cpMatch) cp = parseInt(cpMatch[1], 10) * turn;
        if (cp === null) return;
        if (rank === 1) {
          bestCp = cp;
          const pvMatch = line.match(/ pv (\S+)/);
          if (pvMatch) bestUci = pvMatch[1];
        } else if (rank === 2) {
          secondCp = cp;
        }
      } else if (line.startsWith("bestmove")) {
        const fen = fens[idx];
        if (bestCp !== null) {
          localEvals.set(fen, { cp: bestCp, secondCp, bestSan: bestSanFor(fen) });
        }
        idx += 1;
        setState({
          evals: new Map(localEvals),
          done: idx,
          total: fens.length,
          running: idx < fens.length,
        });
        analyzeNext();
      }
    };

    worker.postMessage("uci");

    return () => {
      terminated = true;
      worker.terminate();
    };
    // key captures the fen content; fens/moveTimeMs read at start are intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, moveTimeMs]);

  return state;
}
