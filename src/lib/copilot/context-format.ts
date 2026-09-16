import type { ConfidenceTier, EstimateBasis, ItemStatus, Marketplace, PricingStrategy } from "../db";
import { MARKETPLACES } from "../marketplaces/registry";
import { formatMoney } from "../money";

/** Pure input for the system context. Built from the database by `context.ts`, or from fixtures in tests. */
export type CopilotContextData = {
  seller: { name: string; city: string | null; region: string | null; pricingStrategy: PricingStrategy; defaultMarketplaces: string[]; offersShipping: boolean; offersLocalPickup: boolean; expertMode: boolean };
  counts: Record<ItemStatus, number>;
  totals: { activeListings: number; sold30d: number; revenue30d: number; revenueAll: number; inventoryValueEstimate: number; realisedProfit: number; pendingOffers: number; drafts: number; ready: number; stale: number };
  marketplaces: Array<{ marketplace: Marketplace; sold: number; revenue: number; active: number; sellThrough: number }>;
  connections: Array<{ marketplace: Marketplace; status: string; mode: string }>;
  /** A handful of the most relevant items so the model can answer without a tool call for simple questions. */
  highlights: Array<{ id: string; title: string; status: ItemStatus; listPrice: number | null; estimate: { recommended: number; basis: EstimateBasis; confidence: ConfidenceTier } | null; daysOnMarket: number | null; pendingOffers: number }>;
  openRecommendations: number;
  demoProviders: boolean;
};

export const ESTIMATE_MARK = "[estimate]";
export const FACT_MARK = "[fact]";

function money(c: number) {
  return formatMoney(c, "USD", { compact: true });
}

function statusWord(s: ItemStatus) {
  return s.toLowerCase().replace("_", " ");
}

/**
 * Compact, plain-text snapshot for the system prompt. Every number derived from an estimate is
 * tagged [estimate]; every recorded number is tagged [fact], so the model can label its answers
 * the same way and never present an estimate as market data.
 */
export function formatSystemContext(d: CopilotContextData, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`Today's date: ${date}.`);
  lines.push(`Seller: ${d.seller.name}${d.seller.city ? `, ${[d.seller.city, d.seller.region].filter(Boolean).join(", ")}` : ""}. Pricing strategy: ${d.seller.pricingStrategy.toLowerCase().replace("_", " ")}. Ships: ${d.seller.offersShipping ? "yes" : "no"}. Local pickup: ${d.seller.offersLocalPickup ? "yes" : "no"}. Default marketplaces: ${d.seller.defaultMarketplaces.map((m) => MARKETPLACES[m as Marketplace]?.name ?? m).join(", ") || "none"}.`);
  if (d.demoProviders) lines.push("Providers: DEMO. Comparable listings and estimates come from Clover's demo catalogue, not live marketplaces. Say so if asked where numbers come from.");
  lines.push("");
  lines.push("Labelling: numbers marked [fact] are recorded (list prices, sold prices, counts, dates). Numbers marked [estimate] come from Clover's price estimates (comparable listings or an AI estimate) and must be called estimates in answers.");
  lines.push("");
  const statuses = (Object.keys(d.counts) as ItemStatus[]).filter((s) => d.counts[s] > 0).map((s) => `${d.counts[s]} ${statusWord(s)}`);
  lines.push(`Inventory ${FACT_MARK}: ${statuses.length ? statuses.join(", ") : "no items yet"}.`);
  lines.push(`Active listings ${FACT_MARK}: ${d.totals.activeListings}. Stale (14+ days, no offers) ${FACT_MARK}: ${d.totals.stale}. Drafts ${FACT_MARK}: ${d.totals.drafts}. Ready to publish ${FACT_MARK}: ${d.totals.ready}. Pending offers ${FACT_MARK}: ${d.totals.pendingOffers}. Open recommendations ${FACT_MARK}: ${d.openRecommendations}.`);
  lines.push(`Sold last 30 days ${FACT_MARK}: ${d.totals.sold30d} items for ${money(d.totals.revenue30d)}. All-time revenue ${FACT_MARK}: ${money(d.totals.revenueAll)}. Realised profit ${FACT_MARK}: ${money(d.totals.realisedProfit)}.`);
  lines.push(`Unsold inventory value ${ESTIMATE_MARK}: ${money(d.totals.inventoryValueEstimate)} (sum of price estimates, list prices where no estimate exists).`);
  if (d.marketplaces.length) {
    lines.push("");
    lines.push(`Marketplaces ${FACT_MARK}:`);
    for (const m of d.marketplaces) lines.push(`- ${MARKETPLACES[m.marketplace].name}: ${m.sold} sold, ${money(m.revenue)} revenue, ${m.active} active, sell-through ${Math.round(m.sellThrough * 100)}%, fee ${Math.round(MARKETPLACES[m.marketplace].fees.rate * 1000) / 10}%`);
  }
  if (d.connections.length) lines.push(`Connections: ${d.connections.map((c) => `${MARKETPLACES[c.marketplace].name} ${c.status.toLowerCase()} (${c.mode})`).join("; ")}.`);
  if (d.highlights.length) {
    lines.push("");
    lines.push("Items most likely to be asked about (use list_items / get_item for anything else):");
    for (const h of d.highlights) {
      const est = h.estimate ? ` est. ${money(h.estimate.recommended)} ${ESTIMATE_MARK} (${h.estimate.basis === "MARKET_EVIDENCE" ? "market evidence" : "AI estimate"}, ${h.estimate.confidence.toLowerCase().replace("_", " ")})` : " no estimate";
      lines.push(`- ${h.id} · ${h.title} · ${statusWord(h.status)}${h.listPrice !== null ? ` · listed ${money(h.listPrice)} ${FACT_MARK}` : ""}${est}${h.daysOnMarket !== null ? ` · ${h.daysOnMarket}d on market` : ""}${h.pendingOffers ? ` · ${h.pendingOffers} pending offer${h.pendingOffers > 1 ? "s" : ""}` : ""}`);
    }
  }
  return lines.join("\n");
}
