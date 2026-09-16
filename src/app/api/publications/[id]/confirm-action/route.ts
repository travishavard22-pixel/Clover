import { json, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { confirmAssistedAction, toPublicationDTO } from "@/lib/marketplaces/publications";

/**
 * POST /api/publications/[id]/confirm-action → { publication }
 * The seller finished the pending assisted step (price change, end listing, double-sell guard)
 * on the marketplace; Clover records the outcome.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const publication = await confirmAssistedAction(user.id, params.id, requestMeta(req));
    return json({ publication: toPublicationDTO(publication) });
  },
  { rateLimit: { key: "pub-confirm-action", limit: 60, windowSeconds: 600 } },
);
