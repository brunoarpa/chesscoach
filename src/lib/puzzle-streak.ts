// Consecutive-clean-solve counter for the tactics ladder, used only to emit the
// `puzzle_streak` GA4 milestone. Each puzzle is its own page load, so the run has
// to live outside the component - kept in localStorage so a streak survives
// navigating from one puzzle to the next. A wrong move or a hint breaks the run.

const KEY = "chesscoach:puzzle-streak";
// Fire the milestone every N clean solves in a row (5, 10, 15, ...).
const MILESTONE = 5;

function read(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function write(n: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(n));
  } catch {
    // Storage full or disabled: the streak just does not persist. Not fatal.
  }
}

// Count one clean solve. Returns the new streak length and whether it just hit a
// milestone (a multiple of MILESTONE), so the caller can fire `puzzle_streak`.
export function recordCleanSolve(): { streak: number; milestone: boolean } {
  const streak = read() + 1;
  write(streak);
  return { streak, milestone: streak % MILESTONE === 0 };
}

// Break the run (a wrong move or a hint). Idempotent.
export function resetStreak(): void {
  write(0);
}
