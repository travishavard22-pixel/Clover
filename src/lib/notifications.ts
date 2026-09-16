import { db } from "./db";

export async function notify(userId: string, n: { type: string; title: string; body: string; href?: string }) {
  return db.notification.create({ data: { userId, ...n } });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
