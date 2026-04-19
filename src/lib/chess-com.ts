/**
 * Chess.com public API utilities
 * API docs: https://www.chess.com/news/view/published-data-api
 */

interface ChessComStats {
  chess_rapid?: { last: { rating: number } };
  chess_blitz?: { last: { rating: number } };
  chess_bullet?: { last: { rating: number } };
  chess_daily?: { last: { rating: number } };
}

interface ChessComProfile {
  joined: number; // Unix timestamp
  username: string; // current username (may differ from stored if renamed)
}

/**
 * Fetch a player's chess rating from chess.com.
 * Uses the maximum of rapid and blitz ratings, then falls back to bullet → daily.
 */
export async function fetchChessComRating(
  chessComUsername: string
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(chessComUsername.toLowerCase())}/stats`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;

    const stats: ChessComStats = await res.json();

    const rapid = stats.chess_rapid?.last?.rating;
    const blitz = stats.chess_blitz?.last?.rating;

    // Use max of rapid and blitz if either exists
    if (rapid != null && blitz != null) return Math.max(rapid, blitz);
    if (rapid != null) return rapid;
    if (blitz != null) return blitz;

    // Fallback: bullet → daily
    return (
      stats.chess_bullet?.last?.rating ??
      stats.chess_daily?.last?.rating ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Fetch a player's chess.com profile info (join date, etc.)
 */
export async function fetchChessComProfile(
  chessComUsername: string
): Promise<{ joined: Date } | null> {
  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(chessComUsername.toLowerCase())}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;

    const profile: ChessComProfile = await res.json();
    return {
      joined: new Date(profile.joined * 1000),
    };
  } catch {
    return null;
  }
}

/**
 * Validate that a chess.com username exists
 */
export async function chessComUsernameExists(
  chessComUsername: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(chessComUsername.toLowerCase())}`,
      { next: { revalidate: 0 } }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch a player's "location" field from their chess.com profile.
 * Used for auto-verification: the user sets a verification code in their location.
 * Returns null on error, empty string if no location set.
 */
export async function fetchChessComLocation(
  chessComUsername: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(chessComUsername.toLowerCase())}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;

    const profile = await res.json();
    return (profile.location as string) ?? "";
  } catch {
    return null;
  }
}

/**
 * Fetch a player's current chess.com username (handles renames).
 */
export async function fetchChessComCurrentUsername(
  chessComUsername: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(chessComUsername.toLowerCase())}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;

    const profile: ChessComProfile = await res.json();
    return profile.username;
  } catch {
    return null;
  }
}

/**
 * Refresh chess.com ratings and usernames for all verified users.
 * Called by the daily cron job.
 */
export async function refreshAllChessComRatings() {
  // Import prisma here to keep the module usable without DB in some contexts
  const { prisma } = await import("@/lib/prisma");

  const users = await prisma.user.findMany({
    where: {
      verificationStatus: "VERIFIED",
      chessComUsername: { not: null },
    },
    select: { id: true, chessComUsername: true },
  });

  for (const user of users) {
    if (!user.chessComUsername) continue;
    const [rating, currentUsername] = await Promise.all([
      fetchChessComRating(user.chessComUsername),
      fetchChessComCurrentUsername(user.chessComUsername),
    ]);
    const updateData: Record<string, unknown> = {};
    if (rating !== null) updateData.chessRating = rating;
    if (currentUsername && currentUsername !== user.chessComUsername) {
      updateData.chessComUsername = currentUsername;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }
  }
}
