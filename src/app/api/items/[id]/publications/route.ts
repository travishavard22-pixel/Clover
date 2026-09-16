import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { buildPublishHub, startPublications } from "@/lib/marketplaces/publications";

const MarketplaceEnum = z.enum(["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"]);
const StartSchema = z.object({ marketplaces: z.array(MarketplaceEnum).min(1, "Pick at least one marketplace").max(7) });

/** GET /api/items/[id]/publications → PublishHubData (one row per marketplace with preview + status). */
export const GET = withUser<{ id: string }>(async (_req, { user, params }) => {
  const hub = await buildPublishHub(user.id, params.id);
  return json(hub);
});

/**
 * POST /api/items/[id]/publications { marketplaces } → { results: StartPublishResult[] }
 * API marketplaces get a PUBLISH job (subscribe to /api/jobs/[jobId]/events); assisted ones come
 * back REQUIRES_USER_ACTION with their checklist ready.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const { marketplaces } = await parseBody(req, StartSchema);
    const results = await startPublications(user.id, params.id, marketplaces, requestMeta(req));
    return json({ results }, { status: 201 });
  },
  { rateLimit: { key: "publish-start", limit: 30, windowSeconds: 600 } },
);
