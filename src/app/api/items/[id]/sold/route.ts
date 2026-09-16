import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { getItemListDTO, markSold, MarkSoldSchema } from "@/lib/inventory";

/**
 * POST /api/items/[id]/sold { soldPriceCents, marketplace?, feesCents?, shippingCostCents?, buyerName?, local?, soldAt? }
 * → { item: ItemListDTO, guarded: [{ publicationId, marketplace, mode, action: "user_action" | "queued_end" }] }
 * Other live publications are protected from a double sale: assisted ones ask the seller to end the
 * listing; API ones are queued for the marketplace worker to end.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const input = await parseBody(req, MarkSoldSchema);
    const result = await markSold(user.id, params.id, input, requestMeta(req));
    const item = await getItemListDTO(user.id, params.id);
    return json({ item, guarded: result.guarded });
  },
  { rateLimit: { key: "item-sold", limit: 120, windowSeconds: 600 } },
);
