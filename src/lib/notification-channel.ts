// Client-safe constants for the personal notification channel. Kept separate
// from lib/notifications.ts (which imports Prisma) so client components can
// reference the channel/event names without pulling server code into the bundle.

/** Pusher channel a user subscribes to for their own real-time notifications. */
export function userChannel(userId: string): string {
  return `private-user-${userId}`;
}

export const NOTIFICATION_NEW_EVENT = "notification:new";
