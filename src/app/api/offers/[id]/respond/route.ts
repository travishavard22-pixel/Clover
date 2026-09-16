import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { RespondSchema, respondToOffer } from "@/lib/offers";

/**
 * POST /api/offers/[id]/respond { action: accept|decline|counter, counterCents?, message? }
 *   → { offer, guarded, repliedVia: "api" | "manual" }
 * API channels send the reply through the marketplace first; assisted channels only record it.
 * Accepting records the sale and runs the double-sell guard (see `guarded`).
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const input = await parseBody(req, RespondSchema);
    const result = await respondToOffer(user.id, params.id, input, requestMeta(req));
    return json(result);
  },
  { rateLimit: { key: "offer-respond", limit: 60, windowSeconds: 600 } },
);
