import type { Evaluator, Proposal, StaleListingConfig } from "../types";
import { daysSince, itemHref, money, offersSince, plural, shortTitle } from "./shared";

export const evaluateStaleListing: Evaluator<"STALE_LISTING"> = (ctx, config: StaleListingConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.status !== "LISTED") continue;
    const days = daysSince(item.listedAt, ctx.now);
    if (days === null || days < config.days) continue;
    if (offersSince(item, item.listedAt).length > 0) continue;
    const checklist = [
      "Compare the price with the current estimate",
      "Replace the cover photo with a studio shot",
      "Rewrite the title with the brand and model first",
      "End and relist so it shows as new",
    ];
    out.push({
      type: "STALE_LISTING",
      itemId: item.id,
      title: `${shortTitle(item.title)} has been quiet for ${plural(days, "day")}`,
      body: `Listed ${plural(days, "day")} ago${item.listPrice !== null ? ` at ${money(item.listPrice)}` : ""} with no offers or messages. Worth a refresh.`,
      proposal: { key: `stale:${item.id}:${Math.floor(days / config.days)}`, action: "review", itemId: item.id, href: itemHref(item.id), checklist },
      autoExecutable: false,
      autoBlockedReason: "Refreshing a listing needs your judgement.",
      notifyPreference: "notifyStale",
    });
  }
  return out;
};
