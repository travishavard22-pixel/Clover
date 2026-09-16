import { json, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { republish, toPublicationDTO } from "@/lib/marketplaces/publications";

/**
 * POST /api/publications/[id]/republish → { publication, jobId }
 * After an end, failure or attention fix: API → new PUBLISH job; assisted → fresh checklist.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const { publication, jobId } = await republish(user.id, params.id, requestMeta(req));
    return json({ publication: toPublicationDTO(publication, jobId ? { id: jobId, status: "QUEUED" } : null), jobId });
  },
  { rateLimit: { key: "pub-republish", limit: 30, windowSeconds: 600 } },
);
