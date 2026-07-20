// Puzzle solving preferences, kept in localStorage so they persist across visits
// (unlike guest progress, which is deliberately session-only). Read through
// useSyncExternalStore rather than copied into state in an effect, matching how
// guest solves are handled in puzzle-progress.ts.

const AUTO_ADVANCE_KEY = "puzzles:auto-advance";

function available(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeAutoAdvance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The raw stored string ("1" / "0" / null). useSyncExternalStore needs a
 * referentially stable value, which a primitive string is.
 */
export function autoAdvanceSnapshot(): string | null {
  if (!available()) return null;
  try {
    return window.localStorage.getItem(AUTO_ADVANCE_KEY);
  } catch {
    return null;
  }
}

/** No localStorage on the server, so auto-advance starts off. */
export function autoAdvanceServerSnapshot(): string | null {
  return null;
}

export function setAutoAdvance(on: boolean): void {
  if (!available()) return;
  try {
    window.localStorage.setItem(AUTO_ADVANCE_KEY, on ? "1" : "0");
    emit();
  } catch {
    // Storage blocked (private mode): the toggle just will not persist.
  }
}
