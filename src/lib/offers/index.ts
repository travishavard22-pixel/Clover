import { z } from "zod";
import { db, Prisma, type Marketplace } from "../db";
import { ApiError } from "../api";
import { getAiProvider } from "../ai";
import { audit } from "../audit";
import { getOwnedItem } from "../items/access";
import { getAdapter, getConnection, marketplaceMode } from "../marketplaces";
import { MARKETPLACES, estimateFees } from "../marketplaces/registry";
import { recordMarketplaceSale, type GuardedPublication } from "../marketplaces/sales";
import { mapEbayError } from "../marketplaces/ebay/errors";
import { ruleBasedAdvice, validateCounter } from "./decision";
import { offerInclude, sortOffers, toOfferDTO, type OfferDTO, type OfferRecord, type OfferSuggestion } from "./dto";

export * from "./decision";
export * from "./dto";

type Meta = { ip?: string | null; userAgent?: string | null };

export async function listOffers(userId: string, opts: { status?: "PENDING" | "ALL" } = {}): Promise<OfferDTO[]> {
  const rows = await db.offer.findMany({ where: { userId, ...(opts.status === "PENDING" ? { status: "PENDING" } : {}) }, include: offerInclude, orderBy: { receivedAt: "desc" }, take: 200 });
  return sortOffers(rows as OfferRecord[]).map(toOfferDTO);
}

export async function getOwnedOffer(userId: string, offerId: string): Promise<OfferRecord> {
  const o = await db.offer.findFirst({ where: { id: offerId, userId }, include: offerInclude });
  if (!o) throw new ApiError(404, "Offer not found", "not_found");
  return o as OfferRecord;
}

// ───────────────────────────── Manual entry ─────────────────────────────

export const LogOfferSchema = z.object({
  itemId: z.string().min(1),
  marketplace: z.enum(["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"]),
  buyerName: z.string().trim().min(1, "Who made the offer?").max(80),
  amountCents: z.number().int().min(1, "Enter the offer amount").max(100_000_000),
  message: z.string().trim().max(1000).optional().nullable(),
});
export type LogOfferInput = z.infer<typeof LogOfferSchema>;

/** Records an offer the seller received on an assisted marketplace (or anywhere Clover cannot read offers). */
export async function logManualOffer(userId: string, input: LogOfferInput, meta: Meta = {}): Promise<OfferDTO> {
  const item = await getOwnedItem(userId, input.itemId);
  if (item.status === "SOLD" || item.status === "SHIPPED" || item.status === "COMPLETED") throw new ApiError(409, "This item is already sold", "bad_status");
  const publication = await db.publication.findUnique({ where: { itemId_marketplace: { itemId: item.id, marketplace: input.marketplace } }, select: { id: true, price: true } });
  const originalPrice = publication?.price ?? item.listPrice ?? input.amountCents;
  const created = await db.offer.create({
    data: { userId, itemId: item.id, publicationId: publication?.id ?? null, marketplace: input.marketplace, buyerName: input.buyerName, amount: input.amountCents, originalPrice, message: input.message?.trim() || null, status: "PENDING", receivedAt: new Date() },
  });
  if (item.status === "LISTED") await db.item.update({ where: { id: item.id }, data: { status: "OFFER_RECEIVED" } });
  await audit({ userId, action: "offer.logged", entityType: "offer", entityId: created.id, meta: { itemId: item.id, marketplace: input.marketplace, amount: input.amountCents }, ...meta });
  return toOfferDTO(await getOwnedOffer(userId, created.id));
}

// ───────────────────────────── Advice ─────────────────────────────

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Asks the AI provider for a suggestion, grounded in the numbers (fee rate, floor, estimate, days
 * listed). When the provider is unavailable the deterministic rules answer instead and the result
 * says so. Stored on the offer so the inbox shows it without re-asking.
 */
export async function adviseOffer(userId: string, offerId: string, meta: Meta = {}): Promise<OfferSuggestion> {
  const o = await getOwnedOffer(userId, offerId);
  const [estimate, publication] = await Promise.all([
    db.priceEstimate.findUnique({ where: { itemId: o.itemId }, select: { quickSale: true, recommended: true, maxValue: true } }),
    o.publicationId ? db.publication.findUnique({ where: { id: o.publicationId }, select: { publishedAt: true } }) : Promise.resolve(null),
  ]);
  const listedFrom = o.item.listedAt ?? publication?.publishedAt ?? o.receivedAt;
  const daysListed = daysBetween(listedFrom, o.receivedAt.getTime() > Date.now() ? new Date() : new Date());
  const feeRate = MARKETPLACES[o.marketplace].fees.rate;
  const input = { itemTitle: o.item.title, listPriceCents: o.originalPrice, offerCents: o.amount, floorPriceCents: o.item.floorPrice, estimate, daysListed, buyerMessage: o.message, marketplace: MARKETPLACES[o.marketplace].name, feeRate };

  let suggestion: OfferSuggestion;
  try {
    const provider = await getAiProvider();
    const advice = await provider.offerAdvice(input);
    const counter = advice.recommendation === "counter" ? advice.counterAmountCents : null;
    // Sanity: a counter must beat the offer and stay under asking; otherwise fall back to the rules' counter.
    const counterOk = counter !== null && validateCounter(Math.round(counter), o.amount, o.originalPrice) === null;
    const rules = ruleBasedAdvice({ offerCents: o.amount, listPriceCents: o.originalPrice, floorPriceCents: o.item.floorPrice, estimate, daysListed, marketplace: o.marketplace, buyerMessage: o.message });
    suggestion = {
      recommendation: advice.recommendation,
      counterAmountCents: advice.recommendation === "counter" ? (counterOk ? Math.round(counter!) : rules.counterAmountCents) : null,
      reasoning: advice.reasoning,
      suggestedMessage: advice.suggestedMessage,
      source: "ai",
      provider: provider.name,
      model: null,
      generatedAt: new Date().toISOString(),
      inputs: { feeRate, daysListed },
    };
  } catch (err) {
    const rules = ruleBasedAdvice({ offerCents: o.amount, listPriceCents: o.originalPrice, floorPriceCents: o.item.floorPrice, estimate, daysListed, marketplace: o.marketplace, buyerMessage: o.message });
    suggestion = { ...rules, provider: "rules", model: null, generatedAt: new Date().toISOString(), inputs: { feeRate, daysListed } };
    await audit({ userId, action: "offer.advice.fallback", entityType: "offer", entityId: o.id, meta: { reason: err instanceof Error ? err.message : String(err) } });
  }
  await db.offer.update({ where: { id: o.id }, data: { suggestion: suggestion as unknown as Prisma.InputJsonValue } });
  await audit({ userId, action: "offer.advised", entityType: "offer", entityId: o.id, meta: { recommendation: suggestion.recommendation, source: suggestion.source }, ...meta });
  return suggestion;
}

// ───────────────────────────── Respond ─────────────────────────────

export const RespondSchema = z
  .object({
    action: z.enum(["accept", "decline", "counter"]),
    counterCents: z.number().int().min(1).max(100_000_000).optional(),
    message: z.string().trim().max(250).optional(),
  })
  .refine((v) => v.action !== "counter" || typeof v.counterCents === "number", { message: "Enter a counter amount", path: ["counterCents"] });
export type RespondInput = z.infer<typeof RespondSchema>;

export type RespondResult = { offer: OfferDTO; guarded: GuardedPublication[]; repliedVia: "api" | "manual" };

/**
 * Accept / decline / counter. API channels (eBay, incl. demo) send the response through the
 * adapter first; assisted channels only record what the seller did on the marketplace. Accepting
 * records the sale and runs the double-sell guard on every other live publication.
 */
export async function respondToOffer(userId: string, offerId: string, input: RespondInput, meta: Meta = {}): Promise<RespondResult> {
  const o = await getOwnedOffer(userId, offerId);
  if (o.status !== "PENDING" && o.status !== "COUNTERED") throw new ApiError(409, `This offer was already ${o.status.toLowerCase()}`, "bad_status");
  if (input.action === "counter") {
    const err = validateCounter(input.counterCents!, o.amount, o.originalPrice);
    if (err) throw new ApiError(400, err, "validation", [{ path: "counterCents", message: err }]);
  }
  const mode = marketplaceMode(o.marketplace);
  const adapter = getAdapter(o.marketplace);
  let repliedVia: RespondResult["repliedVia"] = "manual";
  if (o.publication?.mode === "API" && o.externalId && adapter.respondToOffer && mode !== "assisted") {
    const [connection, publication] = await Promise.all([getConnection(userId, o.marketplace), db.publication.findUnique({ where: { id: o.publication.id } })]);
    if (!connection || connection.status !== "CONNECTED" || !publication) throw new ApiError(409, `${MARKETPLACES[o.marketplace].name} is not connected, so Clover cannot send this reply. Reconnect it or reply on the marketplace and record the outcome here.`, "not_connected");
    try {
      await adapter.respondToOffer({ publication, connection, externalOfferId: o.externalId, action: input.action, counterCents: input.counterCents, message: input.message });
      repliedVia = "api";
    } catch (err) {
      const mapped = mapEbayError(err);
      const text = mapped.status === "NEEDS_ATTENTION" ? `${mapped.attention.message} ${mapped.attention.recovery}` : mapped.status === "FAILED" ? mapped.error : "The marketplace rejected the reply.";
      throw new ApiError(502, text, "marketplace_error");
    }
  }

  const now = new Date();
  const status = input.action === "accept" ? "ACCEPTED" : input.action === "decline" ? "DECLINED" : "COUNTERED";
  await db.offer.update({ where: { id: o.id }, data: { status, counterAmount: input.action === "counter" ? input.counterCents : null, responseMessage: input.message?.trim() || null, respondedAt: now } });

  let guarded: GuardedPublication[] = [];
  if (input.action === "accept") {
    const local = !MARKETPLACES[o.marketplace].supportsShipping;
    const res = await recordMarketplaceSale({ userId, itemId: o.itemId, marketplace: o.marketplace, publicationId: o.publicationId, salePriceCents: o.amount, feesCents: estimateFees(o.marketplace, o.amount, { local }), buyerName: o.buyerName, soldAt: now, source: "offer_accepted", ending: "enqueue" });
    guarded = res.guarded;
  } else {
    const pending = await db.offer.count({ where: { itemId: o.itemId, status: "PENDING" } });
    if (pending === 0 && o.item.status === "OFFER_RECEIVED") await db.item.update({ where: { id: o.itemId }, data: { status: "LISTED" } });
  }
  await audit({ userId, action: `offer.${input.action}`, entityType: "offer", entityId: o.id, meta: { marketplace: o.marketplace, amount: o.amount, counterCents: input.counterCents ?? null, repliedVia, guarded }, ...meta });
  return { offer: toOfferDTO(await getOwnedOffer(userId, o.id)), guarded, repliedVia };
}

/** Items a seller can log an offer against, for the "Log an offer" dialog. */
export async function offerableItems(userId: string): Promise<Array<{ id: string; title: string; sku: string; listPrice: number | null; marketplaces: Marketplace[] }>> {
  const items = await db.item.findMany({ where: { userId, status: { in: ["READY", "LISTED", "OFFER_RECEIVED"] } }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, title: true, sku: true, listPrice: true, publications: { select: { marketplace: true, status: true } } } });
  return items.map((i) => ({ id: i.id, title: i.title, sku: i.sku, listPrice: i.listPrice, marketplaces: [...new Set(i.publications.filter((p) => p.status === "PUBLISHED" || p.status === "REQUIRES_USER_ACTION").map((p) => p.marketplace))] }));
}
