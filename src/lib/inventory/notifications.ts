import { z } from "zod";
import { db, type Notification } from "../db";
import type { NotificationDTO, NotificationsPage } from "./types";

export const NOTIFICATIONS_PAGE = 40;

export function toNotificationDTO(n: Notification): NotificationDTO {
  return { id: n.id, type: n.type, title: n.title, body: n.body, href: n.href, readAt: n.readAt ? n.readAt.toISOString() : null, createdAt: n.createdAt.toISOString() };
}

/** Newest first, cursor = id of the last row on the previous page. */
export async function listNotifications(userId: string, opts: { cursor?: string | null; limit?: number } = {}): Promise<NotificationsPage> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? NOTIFICATIONS_PAGE));
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  const page = rows.slice(0, limit);
  return { notifications: page.map(toNotificationDTO), unread, nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
}

export const MarkReadSchema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200) })]);
export type MarkReadInput = z.infer<typeof MarkReadSchema>;

/** Marks notifications read. Scoped to the user; ids that belong to someone else are ignored. */
export async function markNotificationsRead(userId: string, input: MarkReadInput): Promise<{ updated: number; unread: number }> {
  const where = "all" in input ? { userId, readAt: null } : { userId, readAt: null, id: { in: input.ids } };
  const res = await db.notification.updateMany({ where, data: { readAt: new Date() } });
  const unread = await db.notification.count({ where: { userId, readAt: null } });
  return { updated: res.count, unread };
}

/** Groups notifications by calendar day in the viewer's zone (client-side grouping uses the same labels). */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
