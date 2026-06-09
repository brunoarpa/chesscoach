import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/pusher";
import { userChannel, NOTIFICATION_NEW_EVENT } from "@/lib/notification-channel";
import type { NotificationType } from "@/generated/prisma/client";

export { userChannel, NOTIFICATION_NEW_EVENT };

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Persist an in-app notification and push it to the recipient in real time.
 *
 * Best-effort: a failure here (e.g. Pusher misconfigured) must never break the
 * surrounding action, so callers can fire-and-forget. The DB row is the source
 * of truth; the Pusher push is only for live delivery to an open tab.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });

    const pusher = getPusherServer();
    if (pusher) {
      await pusher.trigger(userChannel(input.userId), NOTIFICATION_NEW_EVENT, {
        notification: JSON.parse(JSON.stringify(notification)),
      });
    }
  } catch (err) {
    // Swallow — notifications are non-critical and must not roll back the caller.
    console.error("createNotification failed", err);
  }
}
