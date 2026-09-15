import { db } from "../../db";
import { getEbayAppToken } from "./app-token";
import { ebayHosts, EBAY_MARKETPLACE_ID } from "./config";

/** Subset of eBay Browse `itemSummaries[]` we use. */
export type BrowseItemSummary = {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  condition?: string;
  conditionId?: string;
  buyingOptions?: string[];
  itemWebUrl?: string;
  image?: { imageUrl: string };
  thumbnailImages?: Array<{ imageUrl: string }>;
  shippingOptions?: Array<{ shippingCost?: { value: string; currency: string }; shippingCostType?: string }>;
  itemLocation?: { country?: string; postalCode?: string };
  seller?: { feedbackPercentage?: string; feedbackScore?: number };
  epid?: string;
  categories?: Array<{ categoryId: string; categoryName: string }>;
  itemCreationDate?: string;
  itemEndDate?: string;
  bidCount?: number;
  currentBidPrice?: { value: string; currency: string };
};

export type BrowseSearchParams = {
  q?: string;
  gtin?: string;
  epid?: string;
  categoryIds?: string[];
  conditionIds?: number[];
  priceRange?: { min?: number; max?: number };
  buyingOptions?: Array<"FIXED_PRICE" | "AUCTION" | "BEST_OFFER">;
  sort?: "price" | "-price" | "newlyListed" | "endingSoonest";
  limit?: number;
  fieldgroups?: Array<"ASPECT_REFINEMENTS" | "CATEGORY_REFINEMENTS" | "CONDITION_REFINEMENTS" | "EXTENDED">;
};

export type BrowseSearchResult = {
  total: number;
  itemSummaries: BrowseItemSummary[];
  refinement?: { categoryDistributions?: Array<{ categoryId: string; categoryName: string; matchCount: number }>; aspectDistributions?: Array<{ localizedAspectName: string; aspectValueDistributions: Array<{ localizedAspectValue: string; matchCount: number }> }> };
};

const DAILY_LIMIT = 5000;

async function consumeQuota(provider: string, limit: number) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await db.apiQuota.upsert({ where: { provider_day: { provider, day } }, create: { provider, day, used: 1, limit }, update: { used: { increment: 1 } } });
  if (row.used > limit) throw new Error(`Daily ${provider} quota (${limit}) exhausted; try again tomorrow`);
}

/** GET /buy/browse/v1/item_summary/search with a 24h cache keyed on the normalised query. */
export async function browseSearch(params: BrowseSearchParams): Promise<BrowseSearchResult> {
  const key = `ebay-browse:${JSON.stringify(params)}`;
  const cached = await db.compCache.findUnique({ where: { key } });
  if (cached && cached.expiresAt > new Date()) return cached.data as unknown as BrowseSearchResult;

  const filters: string[] = [];
  if (params.conditionIds?.length) filters.push(`conditionIds:{${params.conditionIds.join("|")}}`);
  if (params.priceRange && (params.priceRange.min !== undefined || params.priceRange.max !== undefined)) {
    filters.push(`price:[${params.priceRange.min ?? ""}..${params.priceRange.max ?? ""}]`, "priceCurrency:USD");
  }
  if (params.buyingOptions?.length) filters.push(`buyingOptions:{${params.buyingOptions.join("|")}}`);
  filters.push("itemLocationCountry:US");

  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.gtin) qs.set("gtin", params.gtin);
  if (params.epid) qs.set("epid", params.epid);
  if (params.categoryIds?.length) qs.set("category_ids", params.categoryIds.join(","));
  if (filters.length) qs.set("filter", filters.join(","));
  if (params.sort) qs.set("sort", params.sort);
  if (params.fieldgroups?.length) qs.set("fieldgroups", params.fieldgroups.join(","));
  qs.set("limit", String(Math.min(params.limit ?? 50, 200)));

  await consumeQuota("ebay-browse", DAILY_LIMIT);
  const token = await getEbayAppToken();
  const res = await fetch(`${ebayHosts().api}/buy/browse/v1/item_summary/search?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`eBay Browse search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as BrowseSearchResult;
  const result: BrowseSearchResult = { total: data.total ?? 0, itemSummaries: data.itemSummaries ?? [], refinement: data.refinement };
  await db.compCache.upsert({
    where: { key },
    create: { key, data: result as never, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
    update: { data: result as never, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
  });
  return result;
}
