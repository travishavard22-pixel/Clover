import type { DoubleSellGuardConfig, Evaluator, Proposal } from "../types";
import { hoursSince, isOpen, listNames, marketplaceName, money, plural, shortTitle } from "./shared";
import { orphanedPublications, SOLD_STATUSES } from "./sold-sync";

/**
 * The guard is the backstop that keeps an item sold only once. It steps in when
 *  (a) an offer was accepted and other listings are still open, or
 *  (b) the item is recorded as sold and Sold sync has not closed the other listings within the
 *      grace period (or is switched off), or
 *  (c) two marketplaces both report the item as sold — a real double sale that needs the seller.
 */
export const evaluateDoubleSellGuard: Evaluator<"DOUBLE_SELL_GUARD"> = (ctx, config: DoubleSellGuardConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.quantity > 1) continue; // multi-quantity items can legitimately sell more than once

    const soldPubs = item.publications.filter((p) => p.status === "SOLD");
    if (soldPubs.length > 1) {
      out.push({
        type: "DOUBLE_SELL_GUARD",
        itemId: item.id,
        title: `${shortTitle(item.title)} shows as sold on ${soldPubs.length} marketplaces`,
        body: `${listNames(soldPubs.map((p) => p.marketplace))} each report a sale. Check which buyer paid first and cancel the other order before it ships.`,
        proposal: { key: `guard:conflict:${item.id}:${soldPubs.map((p) => p.id).sort().join(",")}`, action: "review", itemId: item.id, href: `/items/${item.id}`, checklist: soldPubs.map((p) => `Check the ${marketplaceName(p.marketplace)} order`) },
        autoExecutable: false,
        autoBlockedReason: "Only you can decide which sale stands.",
        notifyPreference: null,
      });
      continue;
    }

    const accepted = item.offers.find((o) => o.status === "ACCEPTED");
    const sold = SOLD_STATUSES.has(item.status);
    if (!accepted && !sold) continue;

    if (sold) {
      const soldSyncActive = ctx.modes.SOLD_SYNC !== "OFF";
      const age = hoursSince(item.soldAt, ctx.now) ?? Infinity;
      if (soldSyncActive && age < config.graceHours) continue; // give Sold sync its turn
    }

    const keep = sold ? item.soldMarketplace : accepted?.marketplace ?? null;
    const open = orphanedPublications({ ...item, soldMarketplace: keep }, true).filter(isOpen);
    if (!open.length) continue;

    const why = sold ? `recorded as sold${keep ? ` on ${marketplaceName(keep)}` : ""}` : `has an accepted ${money(accepted!.amount)} offer on ${marketplaceName(accepted!.marketplace)}`;
    const api = open.filter((p) => p.mode === "API");
    const assisted = open.filter((p) => p.mode === "ASSISTED");
    out.push({
      type: "DOUBLE_SELL_GUARD",
      itemId: item.id,
      title: `${shortTitle(item.title)} could sell twice`,
      body: `It ${why} but ${plural(open.length, "listing is", "listings are")} still live on ${listNames(open.map((p) => p.marketplace))}.${api.length ? ` Clover can end ${listNames(api.map((p) => p.marketplace))} through the API.` : ""}${assisted.length ? ` ${listNames(assisted.map((p) => p.marketplace))} needs you.` : ""}`,
      proposal: {
        key: `guard:${item.id}:${open.map((p) => p.id).sort().join(",")}`,
        action: "end_listings",
        itemId: item.id,
        publicationIds: open.map((p) => p.id),
        keepMarketplace: keep,
        reason: "sold_elsewhere",
      },
      autoExecutable: true,
      notifyPreference: "notifyPublishing",
    });
  }
  return out;
};
