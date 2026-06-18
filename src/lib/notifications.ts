import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/pusher";
import { userChannel, NOTIFICATION_NEW_EVENT } from "@/lib/notification-channel";
import { sendNotificationEmail, emailText } from "@/lib/email";
import type { NotificationType } from "@/generated/prisma/client";

export { userChannel, NOTIFICATION_NEW_EVENT };

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  /**
   * When set, also email the recipient. Most notifications are in-app only —
   * pass this for the few events worth interrupting someone's inbox for (new
   * request, accepted, declined). The email reuses title/body/link; override
   * the subject or button label here if the in-app copy doesn't fit an inbox.
   */
  email?: boolean | { subject?: string; cta?: string };
}

/**
 * Persist an in-app notification and push it to the recipient in real time.
 *
 * Best-effort: a failure here (e.g. Pusher or SendGrid misconfigured) must
 * never break the surrounding action, so callers can fire-and-forget. The DB
 * row is the source of truth; the Pusher push is only for live delivery to an
 * open tab, and the optional email is a separate best-effort side channel.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  let notification;
  try {
    notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });
  } catch (err) {
    // The DB row is the critical part — if even that fails, give up quietly.
    console.error("createNotification failed", err);
    return;
  }

  // Live push: best-effort, independent of the email below.
  try {
    const pusher = getPusherServer();
    if (pusher) {
      await pusher.trigger(userChannel(input.userId), NOTIFICATION_NEW_EVENT, {
        notification: JSON.parse(JSON.stringify(notification)),
      });
    }
  } catch (err) {
    console.error("notification pusher push failed", err);
  }

  // Optional email: best-effort, must not affect the in-app notification.
  if (input.email) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });
      if (user?.email) {
        const opts = typeof input.email === "object" ? input.email : {};
        await sendNotificationEmail({
          to: user.email,
          subject: opts.subject ?? input.title,
          heading: input.title,
          bodyHtml: input.body ? `<p>${emailText(input.body)}</p>` : "",
          link: input.link,
          cta: opts.cta,
        });
      }
    } catch (err) {
      console.error("notification email failed", err);
    }
  }
}
