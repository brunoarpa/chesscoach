"use client";

import { useEffect, useState } from "react";

export interface GameReviewState {
  // FEN -> best eval in centipawns, white perspective. Filled as analysis runs.
  evals: Map<string, number>;
  done: number;
  total: number;
  running: boolean;
}

const EMPTY: GameReviewState = { evals: new Map(), done: 0, total: 0, running: false };

// Runs Stockfish over a fixed list of positions in the background (one at a
// time, shallow fixed-time search) so the whole game gets evaluated while the
// user is free to explore the board. Re-runs whenever the position list changes.
//
// This is a second worker alongside the live eval bar. It uses a short movetime
// and MultiPV 1 to stay light, especially on phones.
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
    const localEvals = new Map<string, number>();
    let idx = 0;
    let started = false;
    let pendingCp: number | null = null;

    setState({ evals: new Map(), done: 0, total: fens.length, running: true });

    const analyzeNext = () => {
      if (terminated) return;
      if (idx >= fens.length) {
        setState((s) => ({ ...s, running: false }));
        return;
      }
      pendingCp = null;
      worker.postMessage(`position fen ${fens[idx]}`);
      worker.postMessage(`go movetime ${moveTimeMs}`);
    };

    worker.onerror = () => {
      if (!terminated) setState((s) => ({ ...s, running: false }));
    };

    worker.onmessage = (e: MessageEvent) => {
      if (terminated) return;
      const line = typeof e.data === "string" ? e.data : e.data?.data;
      if (typeof line !== "string") return;

      if (line.includes("uciok")) {
        worker.postMessage("setoption name MultiPV value 1");
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
        const mateMatch = line.match(/score mate (-?\d+)/);
        const cpMatch = line.match(/score cp (-?\d+)/);
        if (mateMatch) {
          pendingCp = (parseInt(mateMatch[1], 10) > 0 ? 100000 : -100000) * turn;
        } else if (cpMatch) {
          pendingCp = parseInt(cpMatch[1], 10) * turn;
        }
      } else if (line.startsWith("bestmove")) {
        if (pendingCp !== null) localEvals.set(fens[idx], pendingCp);
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
