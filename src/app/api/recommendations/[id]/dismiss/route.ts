import { json, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { dismissRecommendation } from "@/lib/automations/recommendations";

/** POST /api/recommendations/[id]/dismiss → { recommendation } */
export const POST = withUser<{ id: string }>(async (req, { user, params }) => {
  const recommendation = await dismissRecommendation(user.id, params.id, requestMeta(req));
  return json({ recommendation });
});
