import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { SNOOZE_MAX_DAYS, snoozeRecommendation } from "@/lib/automations/recommendations";

const Body = z.object({ days: z.number().int().min(1).max(SNOOZE_MAX_DAYS).default(7) });

/** POST /api/recommendations/[id]/snooze `{ days }` → { recommendation } */
export const POST = withUser<{ id: string }>(async (req, { user, params }) => {
  const { days } = await parseBody(req, Body);
  const recommendation = await snoozeRecommendation(user.id, params.id, days, requestMeta(req));
  return json({ recommendation });
});
