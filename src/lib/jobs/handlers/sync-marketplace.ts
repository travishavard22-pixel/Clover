import { z } from "zod";
import { db, Prisma, type Marketplace, type MarketplaceConnection, type Offer, type OfferStatus } from "../../db";
import { audit } from "../../audit";
import { formatMoney } from "../../money";
import { notify } from "../../notifications";
import { getAdapter, isMarketplace } from "../../marketplaces";
import { syntheticDraft } from "../../marketplaces/drafts";
import { maskBuyer } from "../../marketplaces/labels";
import { loadSellerPrefs } from "../../marketplaces/prefs";
import { MARKETPLACES } from "../../marketplaces/registry";
import { recordMarketplaceSale } from "../../marketplaces/sales";
import type { SyncedOffer } from "../../marketplaces/types";
import { JobRetryableError, type JobContext } from "../types";
import type { registerJobHandler } from "../runner";

const Payload = z.object({
  userId: z.string().min(1),
  marketplace: z.string().optional(),
  endPublicationId: z.string().optional(),
  updatePublicationId: z.string().optional(),
  priceCents: z.number().int().positive().optional(),
});

/** How far back the first sync of a connection looks for orders. */
const FIRST_SYNC_WINDOW_MS = 30 * 86_400_000;

export type SyncSummary = { ended: string[]; updated: string[]; newOffers: number; sales: number; synced: Marketplace[]; errors: string[] };

/**
 * SYNC_MARKETPLACE: ends or reprices one publication when asked (Engineer E's "Mark sold" and
 * Engineer F's automations enqueue these), then pulls offers and orders for every API connection
 * since its last sync. Orders record the sale and run the double-sell guard.
 */
export async function runSync(ctx: JobContext): Promise<SyncSummary> {
  const payload = Payload.parse(ctx.payload);
  const marketplace = payload.marketplace && isMarketplace(payload.marketplace.toUpperCase()) ? (payload.marketplace.toUpperCase() as Marketplace) : null;
  const summary: SyncSummary = { ended: [], updated: [], newOffers: 0, sales: 0, synced: [], errors: [] };

  if (payload.endPublicationId) await endOne(ctx, payload.userId, payload.endPublicationId, summary);
  if (payload.updatePublicationId && payload.priceCents) await updateOne(ctx, payload.userId, payload.updatePublicationId, payload.priceCents, summary);

  const connections = await db.marketplaceConnection.findMany({ where: { userId: payload.userId, status: "CONNECTED", mode: { in: ["api", "demo"] }, ...(marketplace ? { marketplace } : {}) } });
  for (const c of connections) {
    const adapter = getAdapter(c.marketplace);
    const caps = adapter.capabilities();
    if (caps.offers !== "api" && caps.orders !== "api") continue;
    const info = MARKETPLACES[c.marketplace];
    const label = c.mode === "demo" ? `${info.name} (demo)` : info.name;
    try {
      if (caps.offers === "api" && adapter.syncOffers) summary.newOffers += await syncOffersFor(ctx, c, label);
      if (caps.orders === "api" && adapter.syncOrders) summary.sales += await syncOrdersFor(ctx, c, label);
      await db.marketplaceConnection.update({ where: { id: c.id }, data: { lastSyncAt: new Date(), lastError: null } });
      summary.synced.push(c.marketplace);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${info.name}: ${message}`);
      await db.marketplaceConnection.update({ where: { id: c.id }, data: { lastError: message.slice(0, 500), ...(/reauth|authorization/i.test(message) ? { status: "NEEDS_REAUTH" } : {}) } });
      await ctx.log(`${label}: sync stopped — ${message}`);
    }
  }
  if (summary.errors.length && !summary.synced.length && !payload.endPublicationId && !payload.updatePublicationId) {
    throw new JobRetryableError(summary.errors.join("; "), 60_000);
  }
  return summary;
}

async function endOne(ctx: JobContext, userId: string, publicationId: string, summary: SyncSummary) {
  const p = await db.publication.findFirst({ where: { id: publicationId, userId }, include: { connection: true, item: { select: { status: true, title: true } } } });
  if (!p) {
    await ctx.log(`Publication ${publicationId} no longer exists; nothing to end`);
    return;
  }
  const info = MARKETPLACES[p.marketplace];
  if (p.status === "ENDED" || p.status === "SOLD") {
    await ctx.skip("end", `Ending the ${info.name} listing`, `Already ${p.status.toLowerCase()}`);
    return;
  }
  await ctx.step("end", `Ending the ${info.name} listing`, async (report) => {
    const adapter = getAdapter(p.marketplace);
    const reason = p.item.status === "SOLD" || p.item.status === "SHIPPED" || p.item.status === "COMPLETED" ? "sold_elsewhere" : "withdrawn";
    const res = await adapter.end({ publication: p, connection: p.connection, reason });
    if (res.status === "ENDED") {
      await db.publication.update({ where: { id: p.id }, data: { status: "ENDED", endedAt: new Date(), attention: Prisma.DbNull, lastError: null, checklist: [] as unknown as Prisma.InputJsonValue } });
      await db.recommendation.updateMany({ where: { userId, type: "DOUBLE_SELL_GUARD", status: "OPEN", proposal: { path: ["publicationIds"], array_contains: [p.id] } }, data: { status: "APPLIED", resolvedAt: new Date() } });
      await report(`Ended the ${info.name} listing${p.externalId ? ` (${p.externalId.replace(/^demo-ebay-/, "")})` : ""}`);
      summary.ended.push(p.id);
      await audit({ userId, action: "publication.ended", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, reason, how: "api" } });
    } else if (res.status === "REQUIRES_USER_ACTION") {
      await db.publication.update({
        where: { id: p.id },
        data: { status: "REQUIRES_USER_ACTION", attention: { code: "end_listing", message: res.message ?? `End this listing on ${info.name}.`, recovery: "Open the listing, end it there, then confirm here." }, checklist: [{ key: "end", label: `End this listing on ${info.name}`, done: false, href: res.externalUrl ?? p.externalUrl ?? undefined }] as unknown as Prisma.InputJsonValue },
      });
      await report(`${info.name} needs you to end it: ${res.message ?? ""}`.trim());
    } else {
      await db.publication.update({ where: { id: p.id }, data: { lastError: res.message ?? "Could not end the listing" } });
      await report(`Could not end the ${info.name} listing: ${res.message ?? "unknown error"}`);
      await notify(userId, { type: "publication.end_failed", title: `Could not end the ${info.name} listing`, body: `${p.item.title}: ${res.message ?? "unknown error"} End it on ${info.name} yourself.`, href: p.externalUrl ?? "/listings" });
      throw new Error(res.message ?? "Could not end the listing");
    }
  });
}

async function updateOne(ctx: JobContext, userId: string, publicationId: string, priceCents: number, summary: SyncSummary) {
  const p = await db.publication.findFirst({ where: { id: publicationId, userId }, include: { connection: true, item: { include: { drafts: true } } } });
  if (!p) {
    await ctx.log(`Publication ${publicationId} no longer exists; nothing to update`);
    return;
  }
  const info = MARKETPLACES[p.marketplace];
  if (p.status !== "PUBLISHED") {
    await ctx.skip("update", `Updating the ${info.name} price`, `Listing is ${p.status.toLowerCase().replace(/_/g, " ")}, not live`);
    return;
  }
  await ctx.step("update", `Updating the ${info.name} price to ${formatMoney(priceCents)}`, async (report) => {
    const adapter = getAdapter(p.marketplace);
    const draft = p.item.drafts.find((d) => d.marketplace === p.marketplace) ?? p.item.drafts.find((d) => d.marketplace === null) ?? null;
    const { drafts: _drafts, ...item } = p.item;
    void _drafts;
    const res = await adapter.update({ publication: p, item, draft: draft ?? syntheticDraft(item), connection: p.connection, priceCents });
    if (res.status === "PUBLISHED") {
      await db.publication.update({ where: { id: p.id }, data: { price: priceCents, externalMeta: (res.externalMeta ?? p.externalMeta) as Prisma.InputJsonValue, feePreview: (res.feePreview ?? p.feePreview ?? Prisma.DbNull) as Prisma.InputJsonValue, attention: Prisma.DbNull, lastError: null, lastSyncAt: new Date() } });
      await report(`${info.name} price is now ${formatMoney(priceCents)}`);
      summary.updated.push(p.id);
      await audit({ userId, action: "publication.price.updated", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, priceCents } });
    } else if (res.status === "REQUIRES_USER_ACTION") {
      await db.publication.update({ where: { id: p.id }, data: { price: priceCents, status: "REQUIRES_USER_ACTION", attention: { code: "update_price", message: res.message, recovery: "Update the price on the marketplace, then confirm here." }, checklist: res.checklist as unknown as Prisma.InputJsonValue } });
      await report(`${info.name} needs you to change the price yourself`);
    } else if (res.status === "NEEDS_ATTENTION") {
      await db.publication.update({ where: { id: p.id }, data: { attention: res.attention as Prisma.InputJsonValue } });
      await report(`${info.name}: ${res.attention.message} ${res.attention.recovery}`);
    } else {
      await db.publication.update({ where: { id: p.id }, data: { lastError: res.error } });
      await report(`Could not update the ${info.name} price: ${res.error}`);
      if (res.retryable) throw new JobRetryableError(res.error, 30_000);
      throw new Error(res.error);
    }
  });
}


// ───────────────────────────── Offers ─────────────────────────────

function toOfferStatus(s: SyncedOffer["status"]): OfferStatus {
  return s;
}

async function syncOffersFor(ctx: JobContext, c: MarketplaceConnection, label: string): Promise<number> {
  const adapter = getAdapter(c.marketplace);
  const publications = await db.publication.findMany({ where: { userId: c.userId, marketplace: c.marketplace, status: "PUBLISHED", externalId: { not: null } }, include: { item: { select: { id: true, title: true, status: true } } } });
  if (publications.length === 0) {
    await ctx.skip(`offers:${c.marketplace}`, `Checking ${label} for new offers`, `No live ${MARKETPLACES[c.marketplace].shortName} listings`);
    return 0;
  }
  return ctx.step(`offers:${c.marketplace}`, `Checking ${label} for new offers`, async (report) => {
    let created = 0;
    let seen = 0;
    const prefs = await loadSellerPrefs(c.userId);
    for (const p of publications) {
      const synced = await adapter.syncOffers!({ publication: p, connection: c });
      seen += synced.length;
      for (const so of synced) {
        const existing = await db.offer.findFirst({ where: { userId: c.userId, marketplace: c.marketplace, externalId: so.externalId } });
        if (existing) {
          await applyOfferUpdate(existing, so);
          continue;
        }
        const offer = await db.offer.create({
          data: { userId: c.userId, itemId: p.itemId, publicationId: p.id, marketplace: c.marketplace, externalId: so.externalId, buyerName: so.buyerName, buyerId: so.buyerId, amount: so.amountCents, originalPrice: p.price ?? so.amountCents, message: so.message, status: toOfferStatus(so.status), receivedAt: so.receivedAt, expiresAt: so.expiresAt },
        });
        created++;
        if (offer.status === "PENDING") {
          if (p.item.status === "LISTED") await db.item.update({ where: { id: p.itemId }, data: { status: "OFFER_RECEIVED" } });
          if (prefs.notifyOffers) await notify(c.userId, { type: "offer.new", title: `New offer: ${formatMoney(so.amountCents)} on ${p.item.title}`, body: `New offer: ${formatMoney(so.amountCents)} on ${p.item.title} from ${maskBuyer(so.buyerName)}${so.message ? ` — “${so.message.slice(0, 120)}”` : ""}`, href: `/offers?offer=${offer.id}` });
        }
      }
      await db.publication.update({ where: { id: p.id }, data: { lastSyncAt: new Date() } });
    }
    await report(created ? `${created} new offer${created === 1 ? "" : "s"} from ${label}` : `No new offers on ${label} (${seen} known)`, { created, seen });
    return created;
  });
}

/** Never resurrects an offer the seller already answered; otherwise mirrors the marketplace's status. */
async function applyOfferUpdate(existing: Offer, so: SyncedOffer) {
  const incoming = toOfferStatus(so.status);
  const status = existing.status !== "PENDING" && incoming === "PENDING" ? existing.status : incoming;
  if (status === existing.status && existing.amount === so.amountCents && (existing.message ?? null) === (so.message ?? null)) return;
  await db.offer.update({ where: { id: existing.id }, data: { status, amount: so.amountCents, message: so.message ?? existing.message, expiresAt: so.expiresAt ?? existing.expiresAt, ...(status !== "PENDING" && !existing.respondedAt ? { respondedAt: new Date() } : {}) } });
}

// ───────────────────────────── Orders ─────────────────────────────

async function syncOrdersFor(ctx: JobContext, c: MarketplaceConnection, label: string): Promise<number> {
  const adapter = getAdapter(c.marketplace);
  return ctx.step(`orders:${c.marketplace}`, `Checking ${label} for new orders`, async (report) => {
    const since = c.lastSyncAt ?? c.connectedAt ?? new Date(Date.now() - FIRST_SYNC_WINDOW_MS);
    const orders = await adapter.syncOrders!({ connection: c, since: new Date(since.getTime() - 3600_000) });
    let sales = 0;
    for (const o of orders) {
      const p = await db.publication.findFirst({ where: { userId: c.userId, marketplace: c.marketplace, externalId: o.externalListingId }, include: { item: { select: { id: true, status: true, title: true } } } });
      if (!p) {
        await ctx.log(`${label}: order ${o.externalOrderId} is for a listing Clover did not publish (${o.externalListingId}); ignored`);
        continue;
      }
      if (p.status === "SOLD") continue;
      const res = await recordMarketplaceSale({ userId: c.userId, itemId: p.itemId, marketplace: c.marketplace, publicationId: p.id, salePriceCents: o.salePriceCents, feesCents: o.feesCents, buyerName: o.buyerName, soldAt: o.soldAt, source: "order", externalOrderId: o.externalOrderId, ending: "inline" });
      sales++;
      const guardNote = res.guarded.length ? ` Guard: ${res.guarded.map((g) => `${MARKETPLACES[g.marketplace].shortName} ${g.outcome.replace("_", " ")}`).join(", ")}.` : "";
      await report(`${p.item.title} sold on ${label} for ${formatMoney(o.salePriceCents)}.${guardNote}`, { orderId: o.externalOrderId, guarded: res.guarded });
    }
    if (!sales) await report(`No new orders on ${label}`);
    return sales;
  });
}

export function register(r: typeof registerJobHandler) {
  r("SYNC_MARKETPLACE", runSync);
}
