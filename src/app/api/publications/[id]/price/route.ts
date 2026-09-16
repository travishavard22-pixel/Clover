import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { toPublicationDTO, updatePublicationPrice } from "@/lib/marketplaces/publications";

const PriceSchema = z.object({ priceCents: z.number().int().min(99, "The price has to be at least $0.99").max(100_000_000) });

/**
 * POST /api/publications/[id]/price { priceCents } → { publication, jobId }
 * API: queues the price change (jobId to follow). Assisted: the seller changes it on the
 * marketplace, then confirms via /confirm-action.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const { priceCents } = await parseBody(req, PriceSchema);
    const { publication, jobId } = await updatePublicationPrice(user.id, params.id, priceCents, requestMeta(req));
    return json({ publication: toPublicationDTO(publication, jobId ? { id: jobId, status: "QUEUED" } : null), jobId });
  },
  { rateLimit: { key: "pub-price", limit: 60, windowSeconds: 600 } },
);
