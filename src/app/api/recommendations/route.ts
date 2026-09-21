import { z } from "zod";
import { json, parseQuery, withUser } from "@/lib/api";
import { listRecommendations } from "@/lib/automations/recommendations";
import { AUTOMATION_TYPES } from "@/lib/automations/types";

export const dynamic = "force-dynamic";

const Query = z.object({
  status: z.string().optional(),
  // From the registry, so a new automation is filterable the day it ships.
  type: z.enum(AUTOMATION_TYPES).optional(),
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
