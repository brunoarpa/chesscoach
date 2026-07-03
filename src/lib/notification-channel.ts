// Client-safe constants for the personal notification channel. Kept separate
// from lib/notifications.ts (which imports Prisma) so client components can
// reference the channel/event names without pulling server code into the bundle.

/** Pusher channel a user subscribes to for their own real-time notifications. */
export function userChannel(userId: string): string {
  return `private-user-${userId}`;
}

export const NOTIFICATION_NEW_EVENT = "notification:new";

// Direct-messaging events, delivered on the same personal channel so we don't
// need a separate Pusher channel (or auth rule) per conversation.
/** A new direct message arrived; pushed to the recipient's personal channel. */
export const MESSAGE_NEW_EVENT = "message:new";
/** The recipient read your messages; pushed to the sender's personal channel. */
export const MESSAGE_READ_EVENT = "message:read";
