import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the Tailwind bg class for the activity indicator dot
 * based on how long ago the user was last active.
 * - Green: < 1 hour
 * - Yellow: 1–6 hours
 * - Red: 6–24 hours
 * - Grey: 24+ hours
 */
export function getActivityDotColor(lastActiveAt: Date): string {
  const diffMs = Date.now() - lastActiveAt.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return "bg-green-500";
  if (hours < 6) return "bg-yellow-500";
  if (hours < 24) return "bg-red-500";
  return "bg-gray-400";
}

/**
 * A user is considered a coach if they have set a price for chat or call lessons.
 * chess.com verification is optional and shown as a separate badge.
 */
export function isCoach(user: { coachChatPrice: number | null; coachCallPrice: number | null }): boolean {
  return !!(user.coachChatPrice || user.coachCallPrice);
}

// How long a coach can be away before students see them as Unavailable.
export const AVAILABILITY_INACTIVITY_MS = 24 * 60 * 60 * 1000;

// Booking lead times. A slot must start at least MIN_BOOKING_LEAD_MS in the
// future to be bookable, and a coach must accept at least MIN_ACCEPT_NOTICE_MS
// before the start. The 2x gap guarantees every legal booking leaves the coach
// a real window to respond, and the student always gets at least 15 minutes'
// notice before a lesson can exist (so a last-second accept can never turn
// into a chargeable no-show they couldn't have known about).
export const MIN_BOOKING_LEAD_MS = 30 * 60 * 1000;
export const MIN_ACCEPT_NOTICE_MS = 15 * 60 * 1000;

// How close to the scheduled start a student may still cancel an accepted
// lesson for a full refund. Inside this window the coach has committed the
// slot, so the student is locked in — if the coach doesn't show, the no-show
// path still makes the student whole. Coaches are deliberately exempt:
// a late coach cancellation refunds the student in full, which beats forcing
// the coach into a no-show the student has to sit through and report.
export const STUDENT_CANCEL_CUTOFF_MS = 30 * 60 * 1000;

// ELO penalty a coach takes for not joining a scheduled lesson. Single source
// of truth: applied by the no-show sweep and the student's manual report, and
// reversed by the admin dispute override — all three must move by the same
// amount or penalties drift.
export const NO_SHOW_ELO_PENALTY = 150;

/**
 * Returns the effective coach availability — the single source of truth for
 * what students see and whether a coach can be booked.
 *
 * The stored coachAvailability is purely the coach's manual choice and is
 * never auto-overwritten; this helper derives the rest: a coach appears
 * UNAVAILABLE while they have no price set or have been inactive for 24+
 * hours, and automatically appears AVAILABLE again once they return.
 */
export function getEffectiveAvailability(
  coachAvailability: string,
  lastActiveAt: Date,
  coachChatPrice?: number | null,
  coachCallPrice?: number | null,
): string {
  const hasPrice = (coachChatPrice != null && coachChatPrice > 0) || (coachCallPrice != null && coachCallPrice > 0);
  if (!hasPrice) return "UNAVAILABLE";
  if (Date.now() - lastActiveAt.getTime() >= AVAILABILITY_INACTIVITY_MS) return "UNAVAILABLE";
  return coachAvailability;
}

/**
 * Visual styling for a coach's global leaderboard rank.
 * - #1–3: gold / silver / bronze medal tiers
 * - top 10: highlighted "primary" tier
 * - otherwise: muted
 * Shared by the leaderboard, coach cards, and profile so rank colours stay consistent.
 */
export function getRankStyle(rank: number): { className: string; medal: string | null } {
  if (rank === 1) {
    return { className: "bg-yellow-400/15 text-yellow-700 dark:text-yellow-400 border-yellow-400/50", medal: "🥇" };
  }
  if (rank === 2) {
    return { className: "bg-slate-300/25 text-slate-600 dark:text-slate-300 border-slate-400/50", medal: "🥈" };
  }
  if (rank === 3) {
    return { className: "bg-amber-600/15 text-amber-700 dark:text-amber-500 border-amber-600/50", medal: "🥉" };
  }
  if (rank <= 10) {
    return { className: "bg-primary/10 text-primary border-primary/30", medal: null };
  }
  return { className: "bg-muted text-muted-foreground border-transparent", medal: null };
}

export function getActivityLabel(lastActiveAt: Date): string {
  const diffMs = Date.now() - lastActiveAt.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return "Online";
  if (hours < 6) return "Away";
  if (hours < 24) return "Offline";
  return "Inactive";
}
