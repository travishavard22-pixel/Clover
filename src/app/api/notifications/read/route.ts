import { json, parseBody, withUser } from "@/lib/api";
import { markNotificationsRead, MarkReadSchema } from "@/lib/inventory";

/** POST /api/notifications/read { ids: string[] } | { all: true } → { updated, unread } */
export const POST = withUser(
  async (req, { user }) => {
    const input = await parseBody(req, MarkReadSchema);
    return json(await markNotificationsRead(user.id, input));
  },
  { rateLimit: { key: "notifications-read", limit: 120, windowSeconds: 600 } },
);
