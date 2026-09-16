import { json, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { adviseOffer } from "@/lib/offers";

/**
 * POST /api/offers/[id]/advise → { suggestion: OfferSuggestion }
 * Accept / counter / decline with reasoning and a draft reply. `source` says whether the AI
 * provider or the deterministic rules answered.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const suggestion = await adviseOffer(user.id, params.id, requestMeta(req));
    return json({ suggestion });
  },
  { rateLimit: { key: "offer-advise", limit: 30, windowSeconds: 600 } },
);
