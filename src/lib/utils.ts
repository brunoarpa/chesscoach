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

// Instant (no-slot) lesson requests aren't tied to a future start time, so they
// can't lean on the slot-based acceptance deadline. They expire this long after
// creation if the coach hasn't responded, then refund the student.
export const INSTANT_REQUEST_TTL_MS = 2 * 60 * 60 * 1000;

// A coach is only penalised for letting a request expire unanswered if they had
// at least this long to respond. Near-instant bookings (a slot starting very
// soon, or an instant request the student fires off) can expire faster than
// anyone can reasonably check email, so those misses still refund the student
// but do not count against the coach's responsiveness rating.
export const FAIR_RESPONSE_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Whether a coach had a fair chance to respond to a request before it expired.
 * Used so near-instant bookings that lapse don't count against the coach's
 * responsiveness (rating) or trip the non-responsive abuse flag. A missing
 * deadline (legacy requests that relied on the 3-day sweep) counts as fair.
 */
export function hadFairResponseWindow(
  createdAt: Date,
  acceptanceDeadline: Date | null,
): boolean {
  if (!acceptanceDeadline) return true;
  return acceptanceDeadline.getTime() - createdAt.getTime() >= FAIR_RESPONSE_WINDOW_MS;
}

// Student request limits. A student may have at most this many paid requests
// awaiting a coach's response at once (each one reserves funds), and may only
// send a limited number in a rolling window - so nobody can spam-book across
// many coaches, tie up attention, and lock their own balance.
export const MAX_CONCURRENT_PENDING_REQUESTS = 5;
export const PAID_REQUEST_RATE_MAX = 10;
export const PAID_REQUEST_RATE_WINDOW_MS = 60 * 60 * 1000;

// Length of a single lesson / time slot. Lessons are a fixed length: one slot
// is one lesson. Slot start times are therefore aligned to this length, so
// adjacent bookable slots never overlap (see SLOT_START_MINUTES).
export const LESSON_DURATION_MINUTES = 30;
export const LESSON_DURATION_MS = LESSON_DURATION_MINUTES * 60 * 1000;

// The minute marks within an hour at which a slot may start. Must tile the hour
// by LESSON_DURATION_MINUTES so two slots can't overlap: [0, 30] for 30-min
// lessons. Shared by the schedule editor (which renders these rows) and the
// template validation (which rejects anything else).
export const SLOT_START_MINUTES = [0, 30] as const;

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
// slot, so the student is locked in - if the coach doesn't show, the no-show
// path still makes the student whole. Coaches are deliberately exempt:
// a late coach cancellation refunds the student in full, which beats forcing
// the coach into a no-show the student has to sit through and report.
export const STUDENT_CANCEL_CUTOFF_MS = 30 * 60 * 1000;

// ELO penalty a coach takes for not joining a scheduled lesson. Single source
// of truth: applied by the no-show sweep and the student's manual report, and
// reversed by the admin dispute override - all three must move by the same
// amount or penalties drift.
export const NO_SHOW_ELO_PENALTY = 150;

/**
 * Returns the effective coach availability - the single source of truth for
 * what students see and whether a coach can be booked.
 *
 * Bookability no longer depends on whether the coach is "online": coaches are
 * notified by email when a request comes in, so presence is irrelevant. A coach
 * is bookable when they have a price set and have not manually paused
 * (coachAvailability = UNAVAILABLE). Their last-seen time is shown elsewhere as
 * a cosmetic hint only.
 */
export function getEffectiveAvailability(
  coachAvailability: string,
  coachChatPrice?: number | null,
  coachCallPrice?: number | null,
): string {
  const hasPrice = (coachChatPrice != null && coachChatPrice > 0) || (coachCallPrice != null && coachCallPrice > 0);
  if (!hasPrice) return "UNAVAILABLE";
  return coachAvailability;
}

/**
 * Format a UTC instant in a specific IANA timezone, for server-side contexts
 * that can't use the client <LocalTime> component (notably emails). Falls back
 * to UTC when the timezone is missing or invalid.
 */
export function formatInTimeZone(date: Date, timeZone?: string | null): string {
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: timeZone || "UTC" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(date);
  }
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
