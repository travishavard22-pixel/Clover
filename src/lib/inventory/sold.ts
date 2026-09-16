import { db, Prisma, type Item, type Marketplace, type Publication } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { enqueueJob } from "../jobs/queue";
import { getOwnedItem } from "../items/access";
import { canTransition } from "../items/status";
import { MARKETPLACES } from "../marketplaces/registry";
import { DOUBLE_SELL_ATTENTION, resolveFees, type MarkSoldInput } from "./rules";
import { formatMoney } from "../money";
import { notify } from "../notifications";

const STILL_LIVE = new Set<Publication["status"]>(["READY", "NEEDS_ATTENTION", "PUBLISHING", "PUBLISHED", "REQUIRES_USER_ACTION"]);

export type MarkSoldResult = {
  item: Item;
  guarded: Array<{ publicationId: string; marketplace: Marketplace; mode: Publication["mode"]; action: "user_action" | "queued_end" }>;
};

/**
 * Records a user-initiated sale. Sets the sold fields, marks the publication on the selling
 * marketplace SOLD, and protects every other live publication from a double sale: assisted ones
 * ask the seller to end the listing; API ones queue a SYNC_MARKETPLACE job to end it.
 */
export async function markSold(userId: string, itemId: string, input: MarkSoldInput, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<MarkSoldResult> {
  const item = await getOwnedItem(userId, itemId);
  if (!canTransition(item.status, "SOLD")) throw new ApiError(409, "This item can't be marked sold from its current status", "invalid_transition", { from: item.status, to: "SOLD" });
  const fees = resolveFees(input);
  const soldAt = input.soldAt ?? new Date();
  const soldOn = input.marketplace ? `on ${MARKETPLACES[input.marketplace].name}` : "elsewhere";

  const result = await db.$transaction(async (tx) => {
    const attributes = { ...((item.attributes as Record<string, unknown> | null) ?? {}) };
    if (input.buyerName) attributes.buyerName = input.buyerName;
    if (input.local !== undefined) attributes.soldLocal = input.local;
    const updated = await tx.item.update({
      where: { id: itemId },
      data: {
        status: "SOLD",
        soldPrice: input.soldPriceCents,
        fees,
        shippingCost: input.shippingCostCents ?? item.shippingCost,
        soldMarketplace: input.marketplace ?? null,
        soldAt,
        listedAt: item.listedAt ?? soldAt,
        attributes: attributes as Prisma.InputJsonValue,
      },
    });
    const publications = await tx.publication.findMany({ where: { itemId } });
    const guarded: MarkSoldResult["guarded"] = [];
    for (const p of publications) {
      if (input.marketplace && p.marketplace === input.marketplace) {
        await tx.publication.update({ where: { id: p.id }, data: { status: "SOLD", endedAt: soldAt, attention: Prisma.DbNull } });
        continue;
      }
      if (!STILL_LIVE.has(p.status)) continue;
      const attention = DOUBLE_SELL_ATTENTION(soldOn);
      if (p.mode === "ASSISTED") {
        await tx.publication.update({ where: { id: p.id }, data: { status: "REQUIRES_USER_ACTION", attention } });
        guarded.push({ publicationId: p.id, marketplace: p.marketplace, mode: p.mode, action: "user_action" });
      } else {
        await tx.publication.update({ where: { id: p.id }, data: { attention } });
        guarded.push({ publicationId: p.id, marketplace: p.marketplace, mode: p.mode, action: "queued_end" });
      }
    }
    return { item: updated, guarded };
  });

  for (const g of result.guarded) {
    if (g.action === "queued_end") {
      await enqueueJob("SYNC_MARKETPLACE", { userId, marketplace: g.marketplace, endPublicationId: g.publicationId }, { userId, itemId, steps: [{ key: "end", label: `Ending the ${MARKETPLACES[g.marketplace].name} listing` }] });
    }
  }

  const price = formatMoney(input.soldPriceCents);
  const pending = result.guarded.filter((g) => g.action === "user_action").map((g) => MARKETPLACES[g.marketplace].name);
  const queued = result.guarded.filter((g) => g.action === "queued_end").map((g) => MARKETPLACES[g.marketplace].name);
  const parts = [`${item.title} sold for ${price}${input.marketplace ? ` on ${MARKETPLACES[input.marketplace].name}` : ""}.`];
  if (queued.length) parts.push(`Ending on ${queued.join(", ")} automatically.`);
  if (pending.length) parts.push(`End the ${pending.join(" and ")} listing${pending.length > 1 ? "s" : ""} yourself so it isn't sold twice.`);
  await notify(userId, { type: pending.length ? "double_sell_guard" : "item.sold", title: pending.length ? "Sold — end your other listings" : "Sold", body: parts.join(" "), href: `/items/${itemId}` });
  await audit({ userId, action: "item.sold", entityType: "item", entityId: itemId, meta: { soldPrice: input.soldPriceCents, fees, marketplace: input.marketplace ?? null, guarded: result.guarded }, ...meta });
  return result;
}
