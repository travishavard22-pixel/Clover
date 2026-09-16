import { ApiError, json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { sortComps, toCompDTO, toEstimateDTO } from "@/lib/pricing/dto";
import { recomputeEstimate } from "@/lib/pricing/service";

/**
 * POST /api/items/[id]/estimate/recalculate → { estimate, comps }
 * Re-runs the pricing engine over the stored comparables with the item's current identity, condition
 * and comp overrides. It does not search for new comparables (re-analyze does that).
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    if (!item.conditionGrade && !(await hasProfile(item.id))) throw new ApiError(409, "This item has not been identified yet. Run analysis first.", "no_profile");
    const out = await recomputeEstimate(item.id);
    await audit({ userId: user.id, action: "item.estimate.recalculated", entityType: "item", entityId: item.id, meta: { recommended: out.result.recommended, basis: out.result.basis, compsUsed: out.result.compsUsed }, ...requestMeta(req) });
    return json({ estimate: toEstimateDTO(out.estimate), comps: sortComps(out.comps).map(toCompDTO) });
  },
  { rateLimit: { key: "recalculate", limit: 10, windowSeconds: 600 } },
);

async function hasProfile(itemId: string) {
  const { db } = await import("@/lib/db");
  return !!(await db.itemProfile.findUnique({ where: { itemId }, select: { itemId: true } }));
}
