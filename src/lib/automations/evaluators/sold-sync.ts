import type { Evaluator, Proposal, SnapshotItem, SoldSyncConfig } from "../types";
import { isOpen, listNames, marketplaceName, shortTitle } from "./shared";

export const SOLD_STATUSES = new Set(["SOLD", "SHIPPED", "COMPLETED"]);

/** Publications that could still sell the item a second time and are not already flagged by the guard. */
export function orphanedPublications(item: SnapshotItem, includeAssisted: boolean) {
  return item.publications.filter((p) => {
    if (!isOpen(p)) return false;
    if (item.soldMarketplace && p.marketplace === item.soldMarketplace) return false;
    if (p.attentionCode === "double_sell_guard") return false;
    if (!includeAssisted && p.mode === "ASSISTED") return false;
    return true;
  });
}

export const evaluateSoldSync: Evaluator<"SOLD_SYNC"> = (ctx, config: SoldSyncConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (!SOLD_STATUSES.has(item.status)) continue;
    const orphans = orphanedPublications(item, config.includeAssisted);
    if (!orphans.length) continue;
    const api = orphans.filter((p) => p.mode === "API");
    const assisted = orphans.filter((p) => p.mode === "ASSISTED");
    const where = item.soldMarketplace ? `on ${marketplaceName(item.soldMarketplace)}` : "elsewhere";
    const parts: string[] = [];
    if (api.length) parts.push(`Clover can end the ${listNames(api.map((p) => p.marketplace))} listing${api.length > 1 ? "s" : ""} through the API.`);
    if (assisted.length) parts.push(`${listNames(assisted.map((p) => p.marketplace))} must be ended by you; Clover will add it to your checklist.`);
    out.push({
      type: "SOLD_SYNC",
      itemId: item.id,
      title: `${shortTitle(item.title)} sold ${where} — ${orphans.length} listing${orphans.length > 1 ? "s" : ""} still live`,
      body: parts.join(" "),
      proposal: {
        key: `soldsync:${item.id}:${orphans.map((p) => p.id).sort().join(",")}`,
        action: "end_listings",
        itemId: item.id,
        publicationIds: orphans.map((p) => p.id),
        keepMarketplace: item.soldMarketplace,
        reason: "sold_elsewhere",
      },
      autoExecutable: true,
      notifyPreference: "notifyPublishing",
    });
  }
  return out;
};
