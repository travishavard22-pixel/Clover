import { db, Prisma, type Marketplace, type Publication, type PublicationStatus } from "../db";
import { audit } from "../audit";
import { enqueueJob } from "../jobs/queue";
import { formatMoney } from "../money";
import { notify } from "../notifications";
import { getAdapter, getConnection } from "./index";
import { endListingChecklist } from "./assisted/checklist";
import { MARKETPLACES } from "./registry";

/** Statuses a listing can be in and still sell the item a second time. */
export const LIVE_STATUSES: ReadonlySet<PublicationStatus> = new Set(["READY", "NEEDS_ATTENTION", "PUBLISHING", "PUBLISHED", "REQUIRES_USER_ACTION"]);

export type GuardedPublication = { publicationId: string; marketplace: Marketplace; mode: Publication["mode"]; outcome: "ended" | "queued_end" | "user_action" | "failed"; externalUrl: string | null; message?: string };

export type RecordSaleInput = {
  userId: string;
  itemId: string;
  marketplace: Marketplace;
  /** The publication the sale happened on (may be null for a manual offer with no publication). */
  publicationId: string | null;
  salePriceCents: number;
  feesCents: number | null;
  buyerName: string | null;
  soldAt: Date;
  source: "order" | "offer_accepted";
  externalOrderId?: string | null;
  /**
   * How API listings elsewhere are ended: `inline` calls the adapter now (inside the worker),
   * `enqueue` schedules a SYNC_MARKETPLACE job (from a request handler).
   */
  ending: "inline" | "enqueue";
};

export type RecordSaleResult = { alreadySold: boolean; guarded: GuardedPublication[] };

export function doubleSellAttention(soldOnName: string) {
  return { code: "double_sell_guard", message: `Sold on ${soldOnName} — end this listing`, recovery: "Open the listing on the marketplace and end it so nobody else buys it, then confirm here." };
}

/**
 * Records a sale that came from a marketplace (an order or an accepted offer) and runs the
 * double-sell guard: every other live publication is ended (API) or handed to the seller with a
 * link and a DOUBLE_SELL_GUARD recommendation (assisted). Idempotent: re-running for an already
 * sold item only re-checks the guard.
 */
export async function recordMarketplaceSale(input: RecordSaleInput): Promise<RecordSaleResult> {
  const item = await db.item.findFirst({ where: { id: input.itemId, userId: input.userId } });
  if (!item) throw new Error("Item not found for sale");
  const soldOn = MARKETPLACES[input.marketplace];
  const alreadySold = item.status === "SOLD" || item.status === "SHIPPED" || item.status === "COMPLETED";

  await db.$transaction(async (tx) => {
    if (!alreadySold) {
      const attributes = { ...((item.attributes as Record<string, unknown> | null) ?? {}) };
      if (input.buyerName) attributes.buyerName = input.buyerName;
      if (input.externalOrderId) attributes.externalOrderId = input.externalOrderId;
      attributes.saleSource = input.source;
      await tx.item.update({
        where: { id: item.id },
        data: { status: "SOLD", soldPrice: input.salePriceCents, fees: input.feesCents, soldMarketplace: input.marketplace, soldAt: input.soldAt, listedAt: item.listedAt ?? input.soldAt, attributes: attributes as Prisma.InputJsonValue },
      });
    }
    if (input.publicationId) {
      await tx.publication.update({ where: { id: input.publicationId }, data: { status: "SOLD", endedAt: input.soldAt, attention: Prisma.DbNull, lastSyncAt: new Date() } });
    } else {
      await tx.publication.updateMany({ where: { itemId: item.id, marketplace: input.marketplace, status: { in: [...LIVE_STATUSES] } }, data: { status: "SOLD", endedAt: input.soldAt, attention: Prisma.DbNull } });
    }
    // Other pending offers on this item are moot once it is sold.
    await tx.offer.updateMany({ where: { itemId: item.id, status: "PENDING" }, data: { status: "EXPIRED", respondedAt: new Date() } });
  });

  const guarded = await guardOtherPublications({ userId: input.userId, itemId: item.id, itemTitle: item.title, soldOn: input.marketplace, ending: input.ending });

  const price = formatMoney(input.salePriceCents);
  const userAction = guarded.filter((g) => g.outcome === "user_action").map((g) => MARKETPLACES[g.marketplace].name);
  const ended = guarded.filter((g) => g.outcome === "ended" || g.outcome === "queued_end").map((g) => MARKETPLACES[g.marketplace].name);
  const failed = guarded.filter((g) => g.outcome === "failed").map((g) => MARKETPLACES[g.marketplace].name);
  if (!alreadySold) {
    const parts = [`${item.title} sold for ${price} on ${soldOn.name}${input.buyerName ? ` to ${input.buyerName}` : ""}.`];
    if (ended.length) parts.push(`Ended on ${ended.join(", ")}.`);
    if (userAction.length) parts.push(`End the ${userAction.join(" and ")} listing${userAction.length > 1 ? "s" : ""} yourself so it isn't sold twice.`);
    if (failed.length) parts.push(`Could not end on ${failed.join(", ")} — check Listings.`);
    await notify(input.userId, { type: userAction.length || failed.length ? "double_sell_guard" : "item.sold", title: userAction.length ? "Sold — end your other listings" : `Sold on ${soldOn.name}`, body: parts.join(" "), href: `/items/${item.id}` });
  }
  await audit({ userId: input.userId, action: "item.sold.marketplace", entityType: "item", entityId: item.id, meta: { marketplace: input.marketplace, salePrice: input.salePriceCents, fees: input.feesCents, source: input.source, externalOrderId: input.externalOrderId ?? null, guarded } });
  return { alreadySold, guarded };
}

/**
 * The double-sell guard on its own: end every live publication except the one on `soldOn`.
 * API/demo publications are ended through the adapter (or queued); assisted ones become
 * REQUIRES_USER_ACTION with a link and an open DOUBLE_SELL_GUARD recommendation.
 */
export async function guardOtherPublications(input: { userId: string; itemId: string; itemTitle: string; soldOn: Marketplace | null; ending: "inline" | "enqueue" }): Promise<GuardedPublication[]> {
  const others = await db.publication.findMany({ where: { itemId: input.itemId, userId: input.userId, status: { in: [...LIVE_STATUSES] }, ...(input.soldOn ? { marketplace: { not: input.soldOn } } : {}) } });
  const soldOnName = input.soldOn ? MARKETPLACES[input.soldOn].name : "another marketplace";
  const out: GuardedPublication[] = [];
  for (const p of others) {
    const info = MARKETPLACES[p.marketplace];
    const adapter = getAdapter(p.marketplace);
    const attention = doubleSellAttention(soldOnName);
    if (p.mode === "API" && adapter.capabilities().end === "api") {
      if (input.ending === "enqueue") {
        await db.publication.update({ where: { id: p.id }, data: { attention } });
        await enqueueJob("SYNC_MARKETPLACE", { userId: input.userId, marketplace: p.marketplace, endPublicationId: p.id }, { userId: input.userId, itemId: input.itemId, steps: [{ key: "end", label: `Ending the ${info.name} listing` }] });
        out.push({ publicationId: p.id, marketplace: p.marketplace, mode: p.mode, outcome: "queued_end", externalUrl: p.externalUrl });
        continue;
      }
      const connection = await getConnection(input.userId, p.marketplace);
      const res = await adapter.end({ publication: p, connection, reason: "sold_elsewhere" });
      if (res.status === "ENDED") {
        await db.publication.update({ where: { id: p.id }, data: { status: "ENDED", endedAt: new Date(), attention: Prisma.DbNull, lastError: null } });
        out.push({ publicationId: p.id, marketplace: p.marketplace, mode: p.mode, outcome: "ended", externalUrl: p.externalUrl });
      } else if (res.status === "REQUIRES_USER_ACTION") {
        await markUserMustEnd(p, attention, res.externalUrl ?? p.externalUrl, input, soldOnName);
        out.push({ publicationId: p.id, marketplace: p.marketplace, mode: p.mode, outcome: "user_action", externalUrl: res.externalUrl ?? p.externalUrl, message: res.message });
      } else {
        await db.publication.update({ where: { id: p.id }, data: { attention: { ...attention, message: `Could not end automatically: ${res.message ?? "unknown error"}` }, lastError: res.message ?? "Could not end the listing" } });
        await ensureGuardRecommendation(input, p, soldOnName, res.externalUrl ?? p.externalUrl);
        out.push({ publicationId: p.id, marketplace: p.marketplace, mode: p.mode, outcome: "failed", externalUrl: p.externalUrl, message: res.message });
      }
      continue;
    }
    await markUserMustEnd(p, attention, p.externalUrl ?? info.createUrl, input, soldOnName);
    out.push({ publicationId: p.id, marketplace: p.marketplace, mode: p.mode, outcome: "user_action", externalUrl: p.externalUrl ?? info.createUrl });
  }
  return out;
}

async function markUserMustEnd(p: Publication, attention: ReturnType<typeof doubleSellAttention>, externalUrl: string | null, ctx: { userId: string; itemId: string; itemTitle: string }, soldOnName: string) {
  await db.publication.update({
    where: { id: p.id },
    data: { status: "REQUIRES_USER_ACTION", attention, checklist: endListingChecklist(p.marketplace, externalUrl) as unknown as Prisma.InputJsonValue },
  });
  await ensureGuardRecommendation(ctx, p, soldOnName, externalUrl);
}

async function ensureGuardRecommendation(ctx: { userId: string; itemId: string; itemTitle: string }, p: Publication, soldOnName: string, externalUrl: string | null) {
  const key = `double_sell_guard:${p.id}`;
  const existing = await db.recommendation.findFirst({ where: { userId: ctx.userId, type: "DOUBLE_SELL_GUARD", status: "OPEN", proposal: { path: ["key"], equals: key } }, select: { id: true } });
  if (existing) return;
  const name = MARKETPLACES[p.marketplace].name;
  await db.recommendation.create({
    data: {
      userId: ctx.userId,
      itemId: ctx.itemId,
      type: "DOUBLE_SELL_GUARD",
      title: `End the ${name} listing for ${ctx.itemTitle}`,
      body: `${ctx.itemTitle} sold on ${soldOnName}. The ${name} listing is still live and Clover cannot end it for you, so a second buyer could still commit to it.${externalUrl ? ` Open ${externalUrl} and end it, then confirm in Listings.` : " Open it on the marketplace, end it, then confirm in Listings."}`,
      proposal: { key, action: "end_listings", itemId: ctx.itemId, publicationIds: [p.id], keepMarketplace: null, reason: "sold_elsewhere", externalUrl } as Prisma.InputJsonValue,
    },
  });
}
