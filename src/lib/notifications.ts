import { db } from "./db";
import { sendPushToUser } from "./push";

/** Notification types that are in-app only; everything else is also pushed to registered devices. */
const IN_APP_ONLY = new Set(["system"]);

/**
 * Records an in-app notification and, when the seller has a phone or desktop registered, pushes
 * it there too. Push delivery never throws: the notification row is the record of truth.
 */
export async function notify(userId: string, n: { type: string; title: string; body: string; href?: string }) {
  const row = await db.notification.create({ data: { userId, ...n } });
  if (!IN_APP_ONLY.has(n.type)) {
    try {
      await sendPushToUser(userId, { title: n.title, body: n.body, href: n.href ?? "/notifications", notificationId: row.id });
    } catch (err) {
      console.warn("[push] fan-out failed", err);
    }
  }
  return row;
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
