import type { AutomationType, RecommendationStatus } from "../db";
import type { Proposal } from "./types";

export type ExistingRecommendation = {
  id: string;
  type: AutomationType;
  itemId: string | null;
  status: RecommendationStatus;
  key: string | null;
};

/** Automations where one open recommendation per item is enough, whatever the details. */
const ONE_PER_ITEM: ReadonlySet<AutomationType> = new Set(["REPRICE_STALE", "STALE_LISTING", "PHOTO_QUALITY", "TITLE_QUALITY", "SOLD_SYNC", "DOUBLE_SELL_GUARD", "SHIPPING_PREP"]);

export type DedupeResult = { fresh: Proposal[]; duplicates: Array<{ proposal: Proposal; reason: "same_key" | "open_for_item"; existingId: string }> };

/**
 * Pure de-duplication. A proposal is dropped when
 *  - any recommendation (whatever its status) was created from the exact same proposal key —
 *    a dismissed or applied recommendation must not come back identical; or
 *  - the automation is one-per-item and an OPEN or SNOOZED recommendation already covers the item.
 * Proposals inside the same batch are also de-duplicated by key.
 */
export function dedupeProposals(proposals: Proposal[], existing: ExistingRecommendation[]): DedupeResult {
  const byKey = new Map<string, ExistingRecommendation>();
  const openByTypeItem = new Map<string, ExistingRecommendation>();
  for (const r of existing) {
    if (r.key && !byKey.has(r.key)) byKey.set(r.key, r);
    if ((r.status === "OPEN" || r.status === "SNOOZED") && r.itemId) {
      const k = `${r.type}:${r.itemId}`;
      if (!openByTypeItem.has(k)) openByTypeItem.set(k, r);
    }
  }
  const seen = new Set<string>();
  const fresh: Proposal[] = [];
  const duplicates: DedupeResult["duplicates"] = [];
  for (const p of proposals) {
    if (seen.has(p.proposal.key)) continue;
    seen.add(p.proposal.key);
    const sameKey = byKey.get(p.proposal.key);
    if (sameKey) {
      duplicates.push({ proposal: p, reason: "same_key", existingId: sameKey.id });
      continue;
    }
    if (ONE_PER_ITEM.has(p.type) && p.itemId) {
      const open = openByTypeItem.get(`${p.type}:${p.itemId}`);
      if (open) {
        duplicates.push({ proposal: p, reason: "open_for_item", existingId: open.id });
        continue;
      }
    }
    fresh.push(p);
  }
  return { fresh, duplicates };
}

export function proposalKeyOf(proposal: unknown): string | null {
  if (proposal && typeof proposal === "object" && typeof (proposal as { key?: unknown }).key === "string") return (proposal as { key: string }).key;
  return null;
}
