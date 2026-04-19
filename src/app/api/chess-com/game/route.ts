import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // SSRF prevention: only allow chess.com URLs
  const match = url.match(/chess\.com\/(?:game\/(?:live|daily)|live|daily)\/(\d+)/);
  if (!match) {
    return NextResponse.json({ error: "Invalid Chess.com game URL" }, { status: 400 });
  }

  const gameId = match[1];

  // Try live game endpoint first
  try {
    const liveRes = await fetch(`https://api.chess.com/pub/game/live/${gameId}`, {
      headers: { Accept: "application/json" },
    });
    if (liveRes.ok) {
      const data = await liveRes.json();
      if (data.pgn) {
        return NextResponse.json({ pgn: data.pgn });
      }
    }
  } catch {
    // Fall through to daily
  }

  // Try daily game endpoint
  try {
    const dailyRes = await fetch(`https://api.chess.com/pub/game/daily/${gameId}`, {
      headers: { Accept: "application/json" },
    });
    if (dailyRes.ok) {
      const data = await dailyRes.json();
      if (data.pgn) {
        return NextResponse.json({ pgn: data.pgn });
      }
    }
  } catch {
    // Fall through
  }

  return NextResponse.json(
    { error: "Could not fetch game from Chess.com. Make sure the link is valid." },
    { status: 404 }
  );
}
