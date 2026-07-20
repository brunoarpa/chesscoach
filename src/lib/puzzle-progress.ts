// Guest puzzle progress, deliberately kept in sessionStorage rather than
// localStorage: a visitor keeps their ladder while they are on the site, and
// loses it when they leave unless they make an account. That is the whole
// signup pitch, so it has to actually be true.

const KEY = "chesscoach:guest-puzzle-solves";
// Ids from KEY that were solved with a hint. A subset of the solves; used only to
// tint those tiles differently. Kept separate so the solves format (a plain id
// array) stays unchanged.
const HINT_KEY = "chesscoach:guest-puzzle-hints";

function available(): boolean {
  return typeof window !== "undefined" && !!window.sessionStorage;
}

function readIds(key: string): string[] {
  if (!available()) return [];
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // Corrupt or blocked storage: behave like a first-time visitor.
    return [];
  }
}

export function readGuestSolves(): string[] {
  return readIds(KEY);
}

export function readGuestHints(): string[] {
  return readIds(HINT_KEY);
}

export function addGuestSolve(puzzleId: string, usedHint = false): void {
  if (!available()) return;
  try {
    const solves = readGuestSolves();
    if (!solves.includes(puzzleId)) {
      window.sessionStorage.setItem(KEY, JSON.stringify([...solves, puzzleId]));
    }

    // Track the hint status so the tile can be tinted, and let a clean re-solve
    // clear a previous hint (mirrors the server's hinted -> clean upgrade).
    const hints = readGuestHints();
    if (usedHint && !hints.includes(puzzleId)) {
      window.sessionStorage.setItem(HINT_KEY, JSON.stringify([...hints, puzzleId]));
    } else if (!usedHint && hints.includes(puzzleId)) {
      window.sessionStorage.setItem(HINT_KEY, JSON.stringify(hints.filter((id) => id !== puzzleId)));
    }
    emit();
  } catch {
    // Storage full or disabled: progress just does not persist. Not fatal.
  }
}

export function clearGuestSolves(): void {
  if (!available()) return;
  try {
    window.sessionStorage.removeItem(KEY);
    window.sessionStorage.removeItem(HINT_KEY);
    emit();
  } catch {
    // Nothing to do.
  }
}

// sessionStorage is an external store, so components read it through
// useSyncExternalStore rather than copying it into state inside an effect.
// Nothing else writes this key, so we notify subscribers ourselves.

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeGuestSolves(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The raw stored string, which is what useSyncExternalStore needs: it must be
 * referentially stable between reads, so callers parse it themselves rather than
 * getting a fresh array each time.
 */
export function guestSolvesSnapshot(): string | null {
  if (!available()) return null;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The raw hinted-ids string, read the same way as the solves snapshot. */
export function guestHintsSnapshot(): string | null {
  if (!available()) return null;
  try {
    return window.sessionStorage.getItem(HINT_KEY);
  } catch {
    return null;
  }
}

/** Server render has no sessionStorage, so guests start with an empty ladder. */
export function guestSolvesServerSnapshot(): string | null {
  return null;
}
