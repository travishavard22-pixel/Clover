import type { Evaluator, OfferAlertConfig, Proposal } from "../types";
import { marketplaceName, money, shortTitle } from "./shared";

export const evaluateOfferAlert: Evaluator<"OFFER_ALERT"> = (ctx, config: OfferAlertConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.status === "SOLD" || item.status === "SHIPPED" || item.status === "COMPLETED" || item.status === "ARCHIVED") continue;
    for (const offer of item.offers) {
      if (offer.status !== "PENDING") continue;
      const floor = item.floorPrice;
      if (config.onlyAboveFloor && floor !== null && offer.amount < floor) continue;
      const pctBelow = offer.originalPrice > 0 ? Math.round(((offer.originalPrice - offer.amount) / offer.originalPrice) * 100) : 0;
      const vsAsking = pctBelow > 0 ? `${pctBelow}% below asking ${money(offer.originalPrice)}` : pctBelow < 0 ? `${-pctBelow}% above asking ${money(offer.originalPrice)}` : `at asking ${money(offer.originalPrice)}`;
      const vsFloor = floor === null ? "No floor price set." : offer.amount >= floor ? `Above your ${money(floor)} floor.` : `Below your ${money(floor)} floor.`;
      out.push({
        type: "OFFER_ALERT",
        itemId: item.id,
        title: `${money(offer.amount)} offer for ${shortTitle(item.title)}`,
        body: `${offer.buyerName} on ${marketplaceName(offer.marketplace)} — ${vsAsking}. ${vsFloor}${offer.message ? ` "${offer.message.slice(0, 120)}"` : ""}`,
        proposal: { key: `offer:${offer.id}`, action: "notify", itemId: item.id, href: `/offers?offer=${offer.id}` },
        autoExecutable: true,
        notifyPreference: "notifyOffers",
      });
    }
  }
  return out;
};
