import { json, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { applyRecommendation } from "@/lib/automations/apply";
import { getOwnedRecommendation, toRecommendationDTO } from "@/lib/automations/recommendations";

/** POST /api/recommendations/[id]/apply → { recommendation, result: { summary, manual, jobIds } } */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const rec = await getOwnedRecommendation(user.id, params.id);
    const { recommendation, result } = await applyRecommendation(user.id, rec, { source: "user", ...requestMeta(req) });
    return json({ recommendation: toRecommendationDTO({ ...recommendation, item: rec.item }), result });
  },
  { rateLimit: { key: "recommendations.apply", limit: 60, windowSeconds: 600 } },
);
