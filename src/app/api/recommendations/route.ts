import { z } from "zod";
import { json, parseQuery, withUser } from "@/lib/api";
import { listRecommendations } from "@/lib/automations/recommendations";

export const dynamic = "force-dynamic";

const Query = z.object({
  status: z.string().optional(),
  type: z.enum(["REPRICE_STALE", "STALE_LISTING", "PHOTO_QUALITY", "TITLE_QUALITY", "OFFER_ALERT", "SOLD_SYNC", "DOUBLE_SELL_GUARD", "SHIPPING_PREP", "PENDING_ACTION_REMINDER"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
const STATUSES = ["OPEN", "SNOOZED", "APPLIED", "DISMISSED"] as const;

/** GET /api/recommendations?status=OPEN,SNOOZED&type=&limit= → { recommendations } (OPEN first). */
export const GET = withUser(async (req, { user }) => {
  const q = parseQuery(req, Query);
  const status = q.status
    ? q.status
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(s))
    : undefined;
  const recommendations = await listRecommendations(user.id, { status: status && status.length ? status : undefined, type: q.type, limit: q.limit });
  return json({ recommendations });
});
