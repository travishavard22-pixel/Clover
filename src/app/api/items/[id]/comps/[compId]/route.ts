import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { sortComps, toCompDTO, toEstimateDTO } from "@/lib/pricing/dto";
import { setCompOverride } from "@/lib/pricing/service";

const Schema = z.object({ included: z.boolean() });

/**
 * PATCH /api/items/[id]/comps/[compId] { included } → { estimate, comps }
 * Records the seller's include / exclude decision on one comparable and recomputes the estimate.
 */
export const PATCH = withUser<{ id: string; compId: string }>(
  async (req, { user, params }) => {
    const { included } = await parseBody(req, Schema);
    const item = await getOwnedItem(user.id, params.id);
    const out = await setCompOverride(item.id, params.compId, included);
    await audit({ userId: user.id, action: "item.comp.override", entityType: "comp", entityId: params.compId, meta: { itemId: item.id, included }, ...requestMeta(req) });
    return json({ estimate: toEstimateDTO(out.estimate), comps: sortComps(out.comps).map(toCompDTO) });
  },
  { rateLimit: { key: "comp-override", limit: 120, windowSeconds: 600 } },
);
