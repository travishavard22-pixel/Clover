import { json, withUser } from "@/lib/api";
import { getOwnedItem } from "@/lib/items/access";
import { rendersView } from "@/lib/studio/renders";
import { segmentationStatus } from "@/lib/studio/segmentation";

/**
 * GET /api/items/[id]/studio/renders
 *   → { photos: PhotoDTO[], provenance: Record<photoId, ProvenanceSummary>, segmentation: { available, provider, reason } }
 * `photos` is the item's visible gallery (sources and renders in display order); `provenance` has an
 * entry for every render so the client can label "AI background" / "Enhancement only" honestly.
 */
export const GET = withUser<{ id: string }>(
  async (_req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    const view = await rendersView(item.id);
    return json({ ...view, segmentation: segmentationStatus() });
  },
  { rateLimit: { key: "studio-renders", limit: 240, windowSeconds: 600 } },
);
