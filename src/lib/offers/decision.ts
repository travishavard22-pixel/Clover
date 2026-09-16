import type { Marketplace } from "../db";
import { roundToPricePoint } from "../money";
import { MARKETPLACES, estimateFees } from "../marketplaces/registry";

/**
 * Pure offer arithmetic and the rule-based fallback suggestion. No I/O, so it is unit-tested and
 * shared by the API, the job handlers and the inbox UI.
 */
export type OfferMath = {
  differenceCents: number;
  /** Negative when the offer is below the asking price, e.g. -18.5 for 18.5% under. */
  differencePct: number;
  feesCents: number;
  netCents: number;
  /** Net after fees minus what the seller paid; null when acquisition cost is unknown. */
  estimatedProfitCents: number | null;
};

export function offerMath(input: { amountCents: number; originalPriceCents: number; marketplace: Marketplace; acquisitionCostCents: number | null; local?: boolean }): OfferMath {
  const differenceCents = input.amountCents - input.originalPriceCents;
  const differencePct = input.originalPriceCents > 0 ? Math.round((differenceCents / input.originalPriceCents) * 1000) / 10 : 0;
  const feesCents = estimateFees(input.marketplace, input.amountCents, { local: input.local });
  const netCents = input.amountCents - feesCents;
  const estimatedProfitCents = input.acquisitionCostCents === null ? null : netCents - input.acquisitionCostCents;
  return { differenceCents, differencePct, feesCents, netCents, estimatedProfitCents };
}

export type RuleAdvice = {
  recommendation: "accept" | "counter" | "decline";
  counterAmountCents: number | null;
  reasoning: string;
  suggestedMessage: string;
  source: "rules";
};

export type RuleAdviceInput = {
  offerCents: number;
  listPriceCents: number;
  floorPriceCents: number | null;
  estimate: { quickSale: number; recommended: number; maxValue: number } | null;
  daysListed: number;
  marketplace: Marketplace;
  buyerMessage?: string | null;
};

const money = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

/** The lowest price the rules will accept: the seller's floor, else the quick-sale estimate, else 80% of asking. */
export function effectiveFloor(input: Pick<RuleAdviceInput, "floorPriceCents" | "estimate" | "listPriceCents">): number {
  if (input.floorPriceCents && input.floorPriceCents > 0) return input.floorPriceCents;
  if (input.estimate?.quickSale) return Math.min(input.estimate.quickSale, input.listPriceCents);
  return Math.round(input.listPriceCents * 0.8);
}

/**
 * Deterministic suggestion used when the AI provider is unavailable (and as the sanity check on
 * its output). Rules, in order: at/near asking → accept; at/above floor after three weeks →
 * accept; within 15% under the floor → counter halfway (never below the floor, never above asking);
 * otherwise decline politely.
 */
export function ruleBasedAdvice(input: RuleAdviceInput): RuleAdvice {
  const { offerCents, listPriceCents, daysListed } = input;
  const floor = effectiveFloor(input);
  const info = MARKETPLACES[input.marketplace];
  const fee = estimateFees(input.marketplace, offerCents);
  const pctUnder = listPriceCents > 0 ? Math.round(((listPriceCents - offerCents) / listPriceCents) * 100) : 0;
  const feeLine = fee ? ` After ${info.shortName}'s estimated ${money(fee)} fee you would net ${money(offerCents - fee)}.` : "";

  if (offerCents >= Math.round(listPriceCents * 0.97)) {
    return { recommendation: "accept", counterAmountCents: null, source: "rules", reasoning: `${money(offerCents)} is within 3% of your ${money(listPriceCents)} asking price.${feeLine}`, suggestedMessage: `Thanks — ${money(offerCents)} works for me. I'll accept now.` };
  }
  if (offerCents >= floor && daysListed >= 21) {
    return { recommendation: "accept", counterAmountCents: null, source: "rules", reasoning: `${money(offerCents)} clears your floor of ${money(floor)} and the listing has been live for ${daysListed} days without selling.${feeLine}`, suggestedMessage: `Thanks for the offer. ${money(offerCents)} works — accepting now.` };
  }
  if (offerCents >= Math.round(floor * 0.85)) {
    const midpoint = Math.round((offerCents + listPriceCents) / 2);
    const counter = Math.min(listPriceCents, Math.max(floor, roundToPricePoint(midpoint)));
    const counterFinal = counter <= offerCents ? Math.min(listPriceCents, offerCents + Math.max(100, Math.round(listPriceCents * 0.05))) : counter;
    return {
      recommendation: "counter",
      counterAmountCents: counterFinal,
      source: "rules",
      reasoning: `${money(offerCents)} is ${pctUnder}% under asking${offerCents < floor ? ` and below your floor of ${money(floor)}` : ""}. Countering at ${money(counterFinal)} keeps you ${offerCents < floor ? "at or above the floor" : "closer to asking"} while meeting the buyer part-way.${daysListed ? ` Listed ${daysListed} day${daysListed === 1 ? "" : "s"}.` : ""}`,
      suggestedMessage: `Thanks for the offer! I can't go to ${money(offerCents)}, but I could do ${money(counterFinal)}. Let me know if that works.`,
    };
  }
  return {
    recommendation: "decline",
    counterAmountCents: null,
    source: "rules",
    reasoning: `${money(offerCents)} is ${pctUnder}% under asking and more than 15% below your floor of ${money(floor)}. Declining leaves room for a better offer${daysListed < 14 ? " — the listing is still fresh" : ""}.`,
    suggestedMessage: `Thanks for your interest. ${money(offerCents)} is lower than I can go on this one, but I'm open to offers closer to ${money(floor)}.`,
  };
}

/** Counter offers must beat the buyer's number and stay at or under the asking price. */
export function validateCounter(counterCents: number, offerCents: number, listPriceCents: number): string | null {
  if (!Number.isInteger(counterCents) || counterCents <= 0) return "Enter a counter amount.";
  if (counterCents <= offerCents) return "A counter has to be higher than the buyer's offer.";
  if (listPriceCents > 0 && counterCents > listPriceCents) return "A counter cannot be higher than your asking price.";
  return null;
}
