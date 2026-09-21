import type { Evaluator, OfferAutopilotConfig, Proposal, SnapshotItem, SnapshotOffer } from "../types";
import { marketplaceName, money, shortTitle } from "./shared";

/**
 * Answers offers by rule: accept at or above a percentage of the asking price, decline under the
 * floor, counter in between.
 *
 * This is the one automation that spends the seller's money, so the ordering is deliberately
 * boring and every stop is absolute:
 *
 * 1. The **floor price** beats every percentage. An offer under it is never accepted and never
 *    countered below it, whatever `acceptAtOrAbovePercent` says. `declineBelowFloor` only chooses
 *    what happens to a lowball — a decline, or a counter raised to the floor — never whether the
 *    floor is honoured.
 * 2. **`maxAutoAcceptCents` is a ceiling on unattended acceptance**, not on offers. It guards
 *    against a mistyped asking price — 95% of a price that was meant to be $1,200 and got entered
 *    as $12 is still a bad sale — so anything above it is proposed and left for a person.
 * 3. A counter has to be **above the offer and at or below the asking price**, the same rule the
 *    manual path enforces, or the marketplace would reject it.
 *
 * Offers on assisted listings are proposed but never executed: Clover has no API to answer them
 * with, and saying otherwise in the UI would be a lie about what happened.
 */

const pct = (cents: number, percent: number) => Math.round((cents * percent) / 100);

export type OfferDecision =
  | { response: "accept"; counterCents: null; reason: string }
  | { response: "decline"; counterCents: null; reason: string }
  | { response: "counter"; counterCents: number; reason: string }
  | { response: null; counterCents: null; reason: string };

/**
 * The whole decision, as a pure function of one offer and the rule. Exported because this is the
 * part worth testing exhaustively — the rest of the evaluator is phrasing.
 */
export function decideOffer(input: { offerCents: number; askCents: number; floorCents: number | null }, config: OfferAutopilotConfig): OfferDecision {
  const { offerCents, askCents, floorCents } = input;
  if (askCents <= 0) return { response: null, counterCents: null, reason: "No asking price to compare the offer with." };

  const acceptAt = pct(askCents, config.acceptAtOrAbovePercent);
  const aboveFloor = floorCents === null || offerCents >= floorCents;

  if (offerCents >= acceptAt && aboveFloor) {
    if (config.maxAutoAcceptCents > 0 && offerCents > config.maxAutoAcceptCents) {
      return { response: null, counterCents: null, reason: `Over your ${money(config.maxAutoAcceptCents)} auto-accept ceiling, so it is yours to answer.` };
    }
    return { response: "accept", counterCents: null, reason: `At or above ${config.acceptAtOrAbovePercent}% of the ${money(askCents)} asking price.` };
  }

  // Under the floor: decline if the seller asked for that, otherwise fall through and counter — at
  // the floor, since the clamp below raises any counter to it. Either way nothing sells too cheap.
  if (floorCents !== null && offerCents < floorCents && config.declineBelowFloor) {
    return { response: "decline", counterCents: null, reason: `Below your ${money(floorCents)} floor.` };
  }

  // Counter: the configured percentage of the ask, but never at or below what they already offered,
  // never above the ask, and never below the floor.
  const wanted = pct(askCents, config.counterPercent);
  const counter = Math.min(askCents, Math.max(wanted, floorCents ?? 0));
  if (counter <= offerCents) {
    return { response: null, counterCents: null, reason: `A ${config.counterPercent}% counter would not be above their ${money(offerCents)} offer.` };
  }
  return { response: "counter", counterCents: counter, reason: `Countering at ${config.counterPercent}% of the ${money(askCents)} asking price.` };
}

/** The asking price the buyer is responding to, falling back to the item's list price. */
function askFor(item: SnapshotItem, offer: SnapshotOffer): number {
  return offer.originalPrice > 0 ? offer.originalPrice : (item.listPrice ?? 0);
}

export const evaluateOfferAutopilot: Evaluator<"OFFER_AUTOPILOT"> = (ctx, config: OfferAutopilotConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.status === "SOLD" || item.status === "SHIPPED" || item.status === "COMPLETED" || item.status === "ARCHIVED") continue;
    for (const offer of item.offers) {
      if (offer.status !== "PENDING") continue;
      const askCents = askFor(item, offer);
      const decision = decideOffer({ offerCents: offer.amount, askCents, floorCents: item.floorPrice }, config);
      if (!decision.response) continue;

      const api = offer.publicationMode === "API";
      const verb = decision.response === "accept" ? "Accept" : decision.response === "decline" ? "Decline" : `Counter at ${money(decision.counterCents!)}`;
      out.push({
        type: "OFFER_AUTOPILOT",
        itemId: item.id,
        title: `${verb} — ${money(offer.amount)} for ${shortTitle(item.title)}`,
        body: `${offer.buyerName} on ${marketplaceName(offer.marketplace)}. ${decision.reason}`,
        proposal: {
          key: `autopilot:${offer.id}:${decision.response}`,
          action: "respond_offer",
          itemId: item.id,
          offerId: offer.id,
          response: decision.response,
          counterCents: decision.counterCents,
          offerCents: offer.amount,
          askCents,
          reason: decision.reason,
        },
        autoExecutable: api,
        autoBlockedReason: api ? undefined : `${marketplaceName(offer.marketplace)} has no API to reply through, so this one is yours to send.`,
        notifyPreference: "notifyOffers",
      });
    }
  }
  return out;
};
