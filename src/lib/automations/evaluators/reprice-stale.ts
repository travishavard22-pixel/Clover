import { roundToPricePoint } from "../../money";
import type { Evaluator, Proposal, RepriceConfig, SnapshotItem } from "../types";
import { attr, daysSince, isLiveApi, isOpen, listNames, money, offersSince, plural, shortTitle } from "./shared";

export type RepriceInput = {
  listPrice: number;
  floorPrice: number | null;
  quickSale: number | null;
  stepPercent: number;
  allowBelowQuickSale: boolean;
  minDropCents: number;
};

export type RepriceOutcome = { ok: true; toCents: number; floorCents: number; dropCents: number } | { ok: false; floorCents: number; reason: string };

/**
 * The repricing arithmetic, kept pure so it is testable and reusable as the apply-time guard.
 * New price = max(floor, price × (1 − step)) snapped to a marketplace price point, never below the
 * seller's floor price and never below the quick-sale estimate unless the seller allowed it.
 */
export function computeReprice(input: RepriceInput): RepriceOutcome {
  const guards = [100, input.floorPrice ?? 0, input.allowBelowQuickSale ? 0 : input.quickSale ?? 0];
  const floorCents = Math.max(...guards);
  if (input.listPrice <= floorCents) {
    return { ok: false, floorCents, reason: input.floorPrice !== null && floorCents === input.floorPrice ? "Already at your floor price." : "Already at the quick-sale estimate." };
  }
  const raw = Math.round(input.listPrice * (1 - input.stepPercent / 100));
  let toCents = roundToPricePoint(raw);
  if (toCents >= input.listPrice) toCents = raw; // rounding must never undo the drop
  toCents = Math.max(floorCents, toCents);
  const dropCents = input.listPrice - toCents;
  if (dropCents < input.minDropCents) return { ok: false, floorCents, reason: `The next step (${money(dropCents)}) is smaller than your minimum drop.` };
  return { ok: true, toCents, floorCents, dropCents };
}

/** The moment the current price started: the last reprice if there was one, otherwise the listing date. */
export function priceSince(item: SnapshotItem): string | null {
  return attr(item, "lastRepricedAt") ?? item.listedAt;
}

export const evaluateRepriceStale: Evaluator<"REPRICE_STALE"> = (ctx, config: RepriceConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.status !== "LISTED" || item.listPrice === null) continue;
    const since = priceSince(item);
    const days = daysSince(since, ctx.now);
    if (days === null || days < config.days) continue;
    if (offersSince(item, since).length > 0) continue;

    const result = computeReprice({
      listPrice: item.listPrice,
      floorPrice: item.floorPrice,
      quickSale: item.estimate?.quickSale ?? null,
      stepPercent: config.stepPercent,
      allowBelowQuickSale: config.allowBelowQuickSale,
      minDropCents: config.minDropCents,
    });
    if (!result.ok) continue;

    const open = item.publications.filter(isOpen);
    const api = open.filter(isLiveApi);
    const assisted = open.filter((p) => p.mode === "ASSISTED");
    const floorNote = item.floorPrice !== null ? ` Floor ${money(item.floorPrice)}.` : item.estimate && !config.allowBelowQuickSale ? ` Quick-sale estimate ${money(item.estimate.quickSale)}.` : "";
    out.push({
      type: "REPRICE_STALE",
      itemId: item.id,
      title: `Lower ${shortTitle(item.title)} to ${money(result.toCents)}`,
      body: `${plural(days, "day")} at ${money(item.listPrice)} with no offers. A ${config.stepPercent}% step takes it to ${money(result.toCents)}.${floorNote}${assisted.length ? ` ${listNames(assisted.map((p) => p.marketplace))} listings need the new price entered by hand.` : ""}`,
      proposal: {
        key: `reprice:${item.id}:${item.listPrice}:${result.toCents}`,
        action: "reprice",
        itemId: item.id,
        fromCents: item.listPrice,
        toCents: result.toCents,
        publicationIds: open.map((p) => p.id),
        apiPublicationIds: api.map((p) => p.id),
        reason: `${days} days without an offer`,
      },
      autoExecutable: assisted.length === 0,
      autoBlockedReason: assisted.length ? `${listNames(assisted.map((p) => p.marketplace))} has no price API, so Clover asks instead of changing it.` : undefined,
      notifyPreference: "notifyStale",
    });
  }
  return out;
};
