import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { listOffers, logManualOffer, LogOfferSchema, offerableItems } from "@/lib/offers";

/**
 * GET /api/offers?status=pending|all&items=1 → { offers: OfferDTO[], items?: OfferableItem[] }
 * Pending first, then history. `items=1` adds the items a manual offer can be logged against.
 */
export const GET = withUser(async (req, { user }) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.toUpperCase() === "PENDING" ? "PENDING" : "ALL";
  const wantItems = url.searchParams.get("items") === "1";
  const [offers, items] = await Promise.all([listOffers(user.id, { status }), wantItems ? offerableItems(user.id) : Promise.resolve(undefined)]);
  return json(wantItems ? { offers, items } : { offers });
});

/** POST /api/offers { itemId, marketplace, buyerName, amountCents, message? } → { offer } — logs an offer received off-platform. */
export const POST = withUser(
  async (req, { user }) => {
    const input = await parseBody(req, LogOfferSchema);
    const offer = await logManualOffer(user.id, input, requestMeta(req));
    return json({ offer }, { status: 201 });
  },
  { rateLimit: { key: "offer-log", limit: 60, windowSeconds: 600 } },
);
