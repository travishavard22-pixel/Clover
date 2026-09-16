import { json, withUser } from "@/lib/api";
import { buildItemSummary } from "@/lib/items/summary";

/**
 * GET /api/items/[id]/summary → ItemSummary
 * { item, photos, profile, estimate, comps, drafts, publications, capabilities, prefs, analysis, demo }
 * The review page's single refresh endpoint.
 */
export const GET = withUser<{ id: string }>(async (_req, { user, params }) => {
  const summary = await buildItemSummary(user.id, params.id);
  return json(summary, { headers: { "Cache-Control": "private, no-store" } });
});
