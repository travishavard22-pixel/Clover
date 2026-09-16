import type { MarketplaceConnection } from "../../db";
import { env } from "../../env";
import { ebayUserFetch, ebayUserRequest } from "./client";

const BASE = "/sell/inventory/v1";

export type InventoryItemInput = {
  sku: string;
  title: string;
  description: string;
  aspects: Record<string, string[]>;
  imageUrls: string[];
  brand?: string;
  mpn?: string;
  upc?: string;
  conditionEnum: string;
  conditionDescription?: string;
  quantity: number;
};

/** PUT /inventory_item/{sku} (create or replace). */
export async function createOrReplaceInventoryItem(c: MarketplaceConnection, input: InventoryItemInput): Promise<void> {
  const product: Record<string, unknown> = { title: input.title.slice(0, 80), description: input.description.slice(0, 4000), aspects: input.aspects, imageUrls: input.imageUrls.slice(0, 24) };
  if (input.brand) product.brand = input.brand;
  if (input.mpn) product.mpn = input.mpn;
  if (input.upc) product.upc = [input.upc];
  await ebayUserFetch(c, {
    method: "PUT",
    path: `${BASE}/inventory_item/${encodeURIComponent(input.sku)}`,
    body: {
      product,
      condition: input.conditionEnum,
      ...(input.conditionDescription ? { conditionDescription: input.conditionDescription.slice(0, 1000) } : {}),
      availability: { shipToLocationAvailability: { quantity: input.quantity } },
    },
  });
}

export type OfferInput = {
  sku: string;
  categoryId: string;
  priceCents: number;
  listingDescription: string;
  merchantLocationKey: string;
  policies: { fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string };
  bestOffer?: { enabled: boolean; autoAcceptCents?: number | null; autoDeclineCents?: number | null };
  quantity: number;
};

function offerBody(input: OfferInput) {
  const money = (cents: number) => ({ currency: "USD", value: (cents / 100).toFixed(2) });
  const bestOfferTerms = input.bestOffer?.enabled
    ? { bestOfferEnabled: true, ...(input.bestOffer.autoAcceptCents ? { autoAcceptPrice: money(input.bestOffer.autoAcceptCents) } : {}), ...(input.bestOffer.autoDeclineCents ? { autoDeclinePrice: money(input.bestOffer.autoDeclineCents) } : {}) }
    : { bestOfferEnabled: false };
  return {
    sku: input.sku,
    marketplaceId: env.EBAY_MARKETPLACE_ID,
    format: "FIXED_PRICE",
    listingDuration: "GTC",
    availableQuantity: input.quantity,
    categoryId: input.categoryId,
    merchantLocationKey: input.merchantLocationKey,
    listingDescription: input.listingDescription.slice(0, 500_000),
    pricingSummary: { price: money(input.priceCents) },
    listingPolicies: { ...input.policies, bestOfferTerms },
  };
}

/** Finds an existing offer for a SKU (offers are unique per sku+marketplace). */
export async function getOfferBySku(c: MarketplaceConnection, sku: string): Promise<{ offerId: string; listingId?: string; status?: string } | null> {
  const data = await ebayUserFetch<{ offers?: Array<{ offerId: string; listing?: { listingId?: string; listingStatus?: string }; status?: string }> }>(c, { path: `${BASE}/offer`, query: { sku, marketplace_id: env.EBAY_MARKETPLACE_ID } });
  const o = data.offers?.[0];
  return o ? { offerId: o.offerId, listingId: o.listing?.listingId, status: o.listing?.listingStatus ?? o.status } : null;
}

export async function createOffer(c: MarketplaceConnection, input: OfferInput): Promise<{ offerId: string }> {
  const data = await ebayUserFetch<{ offerId: string }>(c, { method: "POST", path: `${BASE}/offer`, body: offerBody(input) });
  return { offerId: data.offerId };
}

export async function updateOffer(c: MarketplaceConnection, offerId: string, input: OfferInput): Promise<void> {
  await ebayUserFetch(c, { method: "PUT", path: `${BASE}/offer/${offerId}`, body: offerBody(input) });
}

export type ListingFee = { feeType: string; amountCents: number };

/** POST /offer/get_listing_fees — fee preview before publishing. */
export async function getListingFees(c: MarketplaceConnection, offerIds: string[]): Promise<{ fees: ListingFee[]; totalCents: number }> {
  const data = await ebayUserFetch<{ feeSummaries?: Array<{ fees?: Array<{ feeType: string; amount: { value: string; currency: string } }> }> }>(c, { method: "POST", path: `${BASE}/offer/get_listing_fees`, body: { offers: offerIds.map((offerId) => ({ offerId })) } });
  const fees = (data.feeSummaries ?? []).flatMap((s) => (s.fees ?? []).map((f) => ({ feeType: f.feeType, amountCents: Math.round(Number(f.amount.value) * 100) })));
  return { fees, totalCents: fees.reduce((a, f) => a + f.amountCents, 0) };
}

export async function publishOffer(c: MarketplaceConnection, offerId: string): Promise<{ listingId: string; warnings: string[] }> {
  const data = await ebayUserFetch<{ listingId: string; warnings?: Array<{ message?: string; longMessage?: string }> }>(c, { method: "POST", path: `${BASE}/offer/${offerId}/publish` });
  return { listingId: data.listingId, warnings: (data.warnings ?? []).map((w) => w.longMessage ?? w.message ?? "").filter(Boolean) };
}

/** Ends the listing but keeps the offer record so it can be re-published later. */
export async function withdrawOffer(c: MarketplaceConnection, offerId: string): Promise<void> {
  await ebayUserFetch(c, { method: "POST", path: `${BASE}/offer/${offerId}/withdraw` });
}

export async function deleteOffer(c: MarketplaceConnection, offerId: string): Promise<void> {
  const res = await ebayUserRequest(c, { method: "DELETE", path: `${BASE}/offer/${offerId}` });
  await res.text().catch(() => "");
}

/** POST /bulk_update_price_quantity — the cheap way to reprice a live listing. */
export async function updatePrice(c: MarketplaceConnection, sku: string, offerId: string, priceCents: number): Promise<void> {
  await ebayUserFetch(c, {
    method: "POST",
    path: `${BASE}/bulk_update_price_quantity`,
    body: { requests: [{ sku, offers: [{ offerId, price: { currency: "USD", value: (priceCents / 100).toFixed(2) } }] }] },
  });
}

export function ebayListingUrl(listingId: string): string {
  return env.EBAY_ENV === "sandbox" ? `https://www.sandbox.ebay.com/itm/${listingId}` : `https://www.ebay.com/itm/${listingId}`;
}
