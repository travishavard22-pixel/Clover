import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { confirmAssistedPublished, toPublicationDTO } from "@/lib/marketplaces/publications";

const ConfirmSchema = z.object({ externalUrl: z.string().trim().max(2048).optional().nullable() });

/**
 * POST /api/publications/[id]/confirm { externalUrl? } → { publication }
 * "I posted it": marks an assisted publication live. A pasted link is validated against the
 * marketplace's own domain (400 `bad_url` with the reason otherwise) and stored as a plain link.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const { externalUrl } = await parseBody(req, ConfirmSchema);
    const publication = await confirmAssistedPublished(user.id, params.id, externalUrl, requestMeta(req));
    return json({ publication: toPublicationDTO(publication) });
  },
  { rateLimit: { key: "pub-confirm", limit: 60, windowSeconds: 600 } },
);
