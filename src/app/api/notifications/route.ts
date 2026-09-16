import { json, withUser } from "@/lib/api";
import { listNotifications } from "@/lib/inventory";

/** GET /api/notifications?cursor=&limit=40 → { notifications: NotificationDTO[], unread, nextCursor } */
export const GET = withUser(async (req, { user }) => {
  const sp = new URL(req.url).searchParams;
  const raw = Number(sp.get("limit") ?? "");
  const page = await listNotifications(user.id, { cursor: sp.get("cursor"), limit: Number.isFinite(raw) && raw > 0 ? raw : undefined });
  return json(page, { headers: { "Cache-Control": "private, no-store" } });
});
