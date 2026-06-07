import { Chess } from "chess.js";

// chess.com has no public endpoint that returns PGN for a single game by id.
// Its unofficial callback endpoint instead returns the moves in "TCN" — a
// compact encoding of two characters per move. This module decodes TCN to
// {from,to,promotion} squares and replays them through chess.js to rebuild a PGN.

const TCN_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$%/&*";

interface TcnMove {
  from: string;
  to: string;
  promotion?: string;
}

export function decodeTcn(moveList: string): TcnMove[] {
  const moves: TcnMove[] = [];
  const square = (n: number) => "abcdefgh"[n & 7] + ((n >> 3) + 1);
  for (let i = 0; i < moveList.length; i += 2) {
    const from = TCN_CHARS.indexOf(moveList[i]);
    let to = TCN_CHARS.indexOf(moveList[i + 1]);
    let promotion: string | undefined;
    // A `to` index above the 64 squares encodes a promotion: the offset picks
    // the promoted piece and the real destination is derived from the origin.
    if (to > 63) {
      promotion = "qnrbkp"[Math.floor((to - 64) / 3)];
      to = from + (from < 16 ? -8 : 8) + ((to - 1) % 3) - 1;
    }
    moves.push({ from: square(from), to: square(to), promotion });
  }
  return moves;
}

interface CallbackGame {
  moveList?: string;
  initialSetup?: string;
  pgnHeaders?: Record<string, string | number>;
}

// Convert a chess.com callback `game` object into a PGN string, or null if the
// move data is missing or doesn't replay to a legal game.
export function callbackGameToPgn(game: CallbackGame): string | null {
  if (!game.moveList) return null;

  let chess: Chess;
  try {
    // A non-empty initialSetup means a custom start position (e.g. Chess960).
    chess = game.initialSetup ? new Chess(game.initialSetup) : new Chess();
    for (const m of decodeTcn(game.moveList)) {
      chess.move(m); // throws on an illegal move
    }
  } catch {
    return null;
  }

  // Carry over the available tags (White, Black, Result, Date, ECO, …). chess.js
  // owns SetUp/FEN, so skip those.
  if (game.pgnHeaders) {
    for (const [key, value] of Object.entries(game.pgnHeaders)) {
      if (key === "SetUp" || key === "FEN") continue;
      if (value != null && value !== "") chess.header(key, String(value));
    }
  }

  return chess.pgn();
}
