import type { Evaluator, PendingActionConfig, Proposal } from "../types";
import { daysSince, hoursSince, marketplaceName, plural, shortTitle } from "./shared";

export const evaluatePendingAction: Evaluator<"PENDING_ACTION_REMINDER"> = (ctx, config: PendingActionConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    for (const p of item.publications) {
      if (p.status !== "REQUIRES_USER_ACTION") continue;
      if (p.attentionCode === "double_sell_guard") continue; // the guard owns that reminder
      const hours = hoursSince(p.updatedAt, ctx.now);
      if (hours === null || hours < config.publicationHours) continue;
      const wholeDays = Math.floor(hours / 24);
      const age = wholeDays >= 1 ? plural(wholeDays, "day") : `${Math.floor(hours)} hours`;
      out.push({
        type: "PENDING_ACTION_REMINDER",
        itemId: item.id,
        title: `Finish posting ${shortTitle(item.title)} on ${marketplaceName(p.marketplace)}`,
        body: `The listing has been waiting ${age}. Everything is prepared — paste it in and confirm the link.`,
        proposal: { key: `pending:pub:${p.id}:${Math.floor(hours / (24 * 7))}`, action: "notify", itemId: item.id, href: `/listings?item=${item.id}&marketplace=${p.marketplace}` },
        autoExecutable: true,
        notifyPreference: "notifyPublishing",
      });
    }
    if (item.status === "DRAFT" || item.status === "READY") {
      const days = daysSince(item.updatedAt, ctx.now);
      if (days === null || days < config.draftDays) continue;
      const ready = item.status === "READY";
      out.push({
        type: "PENDING_ACTION_REMINDER",
        itemId: item.id,
        title: ready ? `${shortTitle(item.title)} is ready to publish` : `${shortTitle(item.title)} is an unfinished draft`,
        body: ready ? `Reviewed ${plural(days, "day")} ago and not yet listed anywhere.` : `Untouched for ${plural(days, "day")}. Finish the review or archive it.`,
        proposal: { key: `pending:item:${item.id}:${item.status}:${Math.floor(days / 7)}`, action: "notify", itemId: item.id, href: ready ? `/items/${item.id}` : `/sell/review/${item.id}` },
        autoExecutable: true,
        notifyPreference: null,
      });
    }
  }
  return out;
};
