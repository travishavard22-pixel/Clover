import { roundToPricePoint } from "../money";
import type { OfferAdvice } from "../ai/schemas";

export type OfferFacts = {
  offerCents: number;
  listPriceCents: number;
  floorPriceCents: number | null;
  estimate: { quickSale: number; recommended: number; maxValue: number } | null;
  daysListed: number;
  feeRate: number;
  buyerName: string;
};

/**
 * Deterministic offer advice used when the AI provider is unavailable, and as the sanity check
 * shown next to the AI's advice. It is labelled as rule-based in the UI.
 */
export function heuristicOfferAdvice(f: OfferFacts): OfferAdvice & { basis: "rules" } {
  const floor = f.floorPriceCents ?? null;
  const quick = f.estimate?.quickSale ?? null;
  const recommended = f.estimate?.recommended ?? null;
  const net = Math.round(f.offerCents * (1 - f.feeRate));
  const pctOfAsk = f.listPriceCents > 0 ? f.offerCents / f.listPriceCents : 1;
  const patient = f.daysListed < 7;

  if (floor !== null && f.offerCents < floor) {
    const counter = roundToPricePoint(Math.max(floor, Math.round((floor + f.listPriceCents) / 2)));
    return {
      basis: "rules",
      recommendation: "counter",
      counterAmountCents: counter,
      reasoning: `The offer is below your floor price. Counter at ${dollars(counter)}, which sits between your floor and the asking price.`,
      suggestedMessage: `Thanks for the offer, ${f.buyerName}. I can't go that low, but I could do ${dollars(counter)} if that works for you.`,
    };
  }
  const acceptable = (recommended !== null && f.offerCents >= Math.round(recommended * 0.92)) || (quick !== null && f.offerCents >= quick && !patient) || pctOfAsk >= 0.9;
  if (acceptable) {
    return {
      basis: "rules",
      recommendation: "accept",
      counterAmountCents: null,
      reasoning: `${Math.round(pctOfAsk * 100)}% of asking${recommended !== null ? ` and within 8% of the recommended price` : ""}. After fees you would take home about ${dollars(net)}.`,
      suggestedMessage: `Thanks ${f.buyerName}, ${dollars(f.offerCents)} works — accepting now.`,
    };
  }
  if (pctOfAsk < 0.6) {
    return {
      basis: "rules",
      recommendation: "decline",
      counterAmountCents: null,
      reasoning: `At ${Math.round(pctOfAsk * 100)}% of asking this is well below what comparable items fetch. Declining keeps the listing's price signal intact.`,
      suggestedMessage: `Thanks for the interest, ${f.buyerName}, but I'll pass at that price.`,
    };
  }
  const target = Math.max(floor ?? 0, quick ?? 0, Math.round((f.offerCents + f.listPriceCents) / 2));
  const counter = Math.min(f.listPriceCents - 100, roundToPricePoint(target));
  return {
    basis: "rules",
    recommendation: "counter",
    counterAmountCents: counter,
    reasoning: `${Math.round(pctOfAsk * 100)}% of asking after ${f.daysListed} day${f.daysListed === 1 ? "" : "s"} listed. Meeting halfway at ${dollars(counter)} keeps you above ${floor !== null ? "your floor" : "the quick-sale estimate"}.`,
    suggestedMessage: `Thanks ${f.buyerName} — I can meet you at ${dollars(counter)}.`,
  };
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}
