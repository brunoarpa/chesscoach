import { NextResponse } from "next/server";
import { callbackGameToPgn } from "@/lib/chesscom";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

// No auth: this is a read-only proxy for *public* chess.com game data, locked to
// chess.com game ids below. It must work in the login-free practice room too
// (mirroring Lichess import, which the browser fetches directly).
export async function GET(request: Request) {
  // It's unauthenticated and makes a server-side outbound fetch, so rate-limit
  // per IP to stop it being used as an open relay to chess.com's callback API.
  const ip = getClientIpFromHeaders(request.headers);
  const { success: rlOk } = await rateLimit(`chesscom-game:${ip}`, { maxAttempts: 30, windowMs: 60 * 1000 });
  if (!rlOk) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // SSRF prevention: only allow chess.com URLs, and only pull the numeric id.
  const match = url.match(/chess\.com\/(?:game\/(?:live|daily)|live|daily)\/(\d+)/);
  if (!match) {
    return NextResponse.json({ error: "Invalid Chess.com game URL" }, { status: 400 });
  }

  const gameId = match[1];

  // chess.com has no public single-game PGN endpoint, so use the callback
  // endpoint (returns TCN-encoded moves) and rebuild the PGN ourselves. A live
  // URL can still be a daily game and vice versa, so try both.
  for (const kind of ["live", "daily"] as const) {
    try {
      const res = await fetch(`https://www.chess.com/callback/${kind}/game/${gameId}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; EloChaser)",
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const pgn = callbackGameToPgn(data?.game ?? {});
      if (pgn) {
        return NextResponse.json({ pgn });
      }
    } catch {
      // Try the next game type.
    }
  }

  return NextResponse.json(
    { error: "Could not fetch game from Chess.com. Make sure the link is valid." },
    { status: 404 }
  );
}
