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

export function getActivityLabel(lastActiveAt: Date): string {
  const diffMs = Date.now() - lastActiveAt.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return "Online";
  if (hours < 6) return "Away";
  if (hours < 24) return "Offline";
  return "Inactive";
}
