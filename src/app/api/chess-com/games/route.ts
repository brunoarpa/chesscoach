import { NextResponse } from "next/server";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

// Lists a player's games for one month from chess.com's public monthly archive,
// so a visitor can pick a game by tapping it instead of hunting for a share
// link (painful on phones). Returns only lightweight metadata; the chosen game's
// PGN is fetched on click via /api/chess-com/game.

const USERNAME_RE = /^[a-zA-Z0-9_-]{1,40}$/;

interface ArchiveGame {
  url?: string;
  time_class?: string;
  end_time?: number;
  rated?: boolean;
  white?: { username?: string; result?: string; rating?: number };
  black?: { username?: string; result?: string; rating?: number };
}

function outcome(white?: string, black?: string): "white" | "black" | "draw" {
  if (white === "win") return "white";
  if (black === "win") return "black";
  return "draw";
}

export async function GET(request: Request) {
  // Unauthenticated server-side fetch, so rate-limit per IP like the single-game
  // proxy - this must not become an open relay to chess.com's API.
  const ip = getClientIpFromHeaders(request.headers);
  const { success } = await rateLimit(`chesscom-games:${ip}`, { maxAttempts: 30, windowMs: 60 * 1000 });
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("username") || "").trim().toLowerCase();
  const year = parseInt(searchParams.get("year") || "", 10);
  const month = parseInt(searchParams.get("month") || "", 10);

  const now = new Date();
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "Enter a valid Chess.com username." }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2007 || year > now.getUTCFullYear()) {
    return NextResponse.json({ error: "Invalid month." }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month." }, { status: 400 });
  }

  const mm = String(month).padStart(2, "0");
  let res: Response;
  try {
    res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EloChaser)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Chess.com. Please try again." }, { status: 502 });
  }

  if (res.status === 404) {
    return NextResponse.json({ error: "No Chess.com player with that username.", games: [] }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: "Could not load games from Chess.com.", games: [] }, { status: 502 });
  }

  let data: { games?: ArchiveGame[] };
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({ error: "Unexpected response from Chess.com.", games: [] }, { status: 502 });
  }

  const games = (Array.isArray(data.games) ? data.games : [])
    .filter((g): g is ArchiveGame => !!g?.url && !!g.white?.username && !!g.black?.username)
    .map((g) => ({
      url: g.url as string,
      timeClass: g.time_class ?? "",
      endTime: g.end_time ?? 0,
      rated: !!g.rated,
      white: { username: g.white!.username as string, rating: g.white!.rating ?? null },
      black: { username: g.black!.username as string, rating: g.black!.rating ?? null },
      result: outcome(g.white!.result, g.black!.result),
    }))
    .sort((a, b) => b.endTime - a.endTime);

  return NextResponse.json({ username, games });
}
