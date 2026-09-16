import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { endPublication, toPublicationDTO } from "@/lib/marketplaces/publications";

const EndSchema = z.object({ confirmed: z.boolean().optional() }).default({});

/**
 * POST /api/publications/[id]/end { confirmed? } → { publication, jobId }
 * API: queues the end through the adapter (jobId to follow). Assisted: returns a one-step
 * checklist; `confirmed: true` records that the seller ended it on the marketplace.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const body = req.headers.get("content-length") === "0" || !req.headers.get("content-type")?.includes("json") ? {} : await parseBody(req, EndSchema);
    const { publication, jobId } = await endPublication(user.id, params.id, { confirmed: body.confirmed }, requestMeta(req));
    return json({ publication: toPublicationDTO(publication, jobId ? { id: jobId, status: "QUEUED" } : null), jobId });
  },
  { rateLimit: { key: "pub-end", limit: 60, windowSeconds: 600 } },
);
