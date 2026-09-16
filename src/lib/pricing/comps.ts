import type { ItemProfile } from "../ai/schemas";
import { catalogByHash, matchCatalogByProfile, type DemoCatalogEntry } from "../demo/catalog";
import type { ConditionGrade } from "../db";
import { env } from "../env";
import { browseSearch, type BrowseItemSummary, type BrowseSearchResult } from "../marketplaces/ebay/browse";
import { tokenize } from "./engine";
import type { CompCandidate } from "./types";

/**
 * Comparable-listing providers (research §2.1). The eBay Browse provider is real market evidence;
 * the Demo provider serves labelled catalogue comps so the whole pipeline runs without keys.
 */

export type CompsProviderName = "ebay" | "demo";

export type CompsSearchOptions = {
  now?: Date;
  limit?: number;
  /** Item title / brand / model overrides (the seller's edits win over the profile). */
  target?: { itemName?: string | null; brand?: string | null; model?: string | null; conditionGrade?: ConditionGrade | null };
};

export type CompsSearchResult = {
  provider: CompsProviderName;
  comps: CompCandidate[];
  /** Item-specific vocabulary ("Brand: Canon", "Film Format: 35mm", dominant categories, frequent title terms). */
  vocabulary: string[];
  /** The query that was sent (or would have been sent), for the expert panel. */
  query: { gtin: string | null; q: string | null; conditionIds: number[] };
  /** Set when a real provider failed and the result came from the fallback. */
  error: string | null;
};

export interface CompsProvider {
  readonly name: CompsProviderName;
  search(profile: ItemProfile, opts?: CompsSearchOptions): Promise<CompsSearchResult>;
}

// ─────────────────────────── shared helpers ───────────────────────────

const GTIN_RE = /^\d{8}$|^\d{12,14}$/;

export function gtinFromProfile(profile: Pick<ItemProfile, "barcodeVisible">): string | null {
  const digits = (profile.barcodeVisible ?? "").replace(/\D/g, "");
  return GTIN_RE.test(digits) ? digits : null;
}

/** Brand + model + product-type keywords, de-duplicated, ≤ 10 tokens — what a buyer would type. */
export function buildQuery(profile: Pick<ItemProfile, "itemName" | "brand" | "model" | "modelNumber" | "searchKeywords">, target?: CompsSearchOptions["target"]): string {
  const brand = target?.brand ?? profile.brand?.value ?? null;
  const model = target?.model ?? profile.model?.value ?? null;
  const name = target?.itemName ?? profile.itemName.value;
  const seen = new Set<string>();
  const words: string[] = [];
  const push = (s: string | null | undefined) => {
    if (!s) return;
    for (const raw of s.split(/\s+/)) {
      const w = raw.replace(/[^\w.'/+-]/g, "");
      const key = w.toLowerCase();
      if (!w || seen.has(key)) continue;
      seen.add(key);
      words.push(w);
    }
  };
  push(brand);
  push(model);
  push(profile.modelNumber?.value ?? null);
  // Product-type words from the name that are not already covered (skip generic filler).
  const nameTokens = tokenize(name).filter((t) => !seen.has(t));
  push(nameTokens.slice(0, 4).join(" "));
  if (words.length < 3) push(profile.searchKeywords[0] ?? null);
  return words.slice(0, 10).join(" ");
}

/** eBay condition ids by grade family. Category-specific grades (2750/4000/5000/6000) are included with the generic 3000. */
export function conditionIdsForGrade(grade: ConditionGrade | null | undefined): number[] {
  switch (grade) {
    case "NEW_SEALED":
    case "NEW_OPEN_BOX":
      return [1000, 1500];
    case "FOR_PARTS":
      return [7000];
    case undefined:
    case null:
      return [1000, 1500, 2750, 3000, 4000, 5000, 6000];
    default:
      return [2750, 3000, 4000, 5000, 6000];
  }
}

/**
 * Maps an eBay condition (id + display text) back to our grades. The generic "Used" (3000) carries no
 * sub-grade, so it maps to null and the engine applies no condition multiplier to it.
 */
export function ebayConditionToGrade(conditionId: string | number | null | undefined, conditionText?: string | null): ConditionGrade | null {
  const id = typeof conditionId === "string" ? Number(conditionId) : conditionId ?? null;
  switch (id) {
    case 1000:
      return "NEW_SEALED";
    case 1500:
    case 1750:
      return "NEW_OPEN_BOX";
    case 2000:
    case 2010:
    case 2020:
    case 2030:
    case 2500:
    case 2750:
      return "LIKE_NEW";
    case 4000:
      return "VERY_GOOD";
    case 5000:
      return "GOOD";
    case 6000:
      return "FAIR";
    case 7000:
      return "FOR_PARTS";
    default:
      break;
  }
  const t = (conditionText ?? "").toLowerCase();
  if (/new with tags|brand new|^new$/.test(t)) return "NEW_SEALED";
  if (/open box|new without tags|new other/.test(t)) return "NEW_OPEN_BOX";
  if (/like new|excellent|mint|refurbished/.test(t)) return "LIKE_NEW";
  if (/very good/.test(t)) return "VERY_GOOD";
  if (/^good/.test(t)) return "GOOD";
  if (/acceptable|fair/.test(t)) return "FAIR";
  if (/parts|not working/.test(t)) return "FOR_PARTS";
  return null;
}

function cents(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Frequent, non-stopword tokens across comp titles (≥ 25% of titles), most frequent first. */
export function titleTerms(titles: string[], max = 12): string[] {
  const counts = new Map<string, number>();
  for (const t of titles) for (const tok of new Set(tokenize(t))) counts.set(tok, (counts.get(tok) ?? 0) + 1);
  const min = Math.max(2, Math.ceil(titles.length * 0.25));
  return [...counts.entries()]
    .filter(([tok, n]) => n >= min && tok.length > 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([tok]) => tok);
}

// ─────────────────────────── eBay Browse ───────────────────────────

export function mapBrowseSummary(s: BrowseItemSummary): CompCandidate | null {
  const price = cents(s.price?.value);
  if (price === null || !s.title) return null;
  const opt = s.shippingOptions?.[0];
  const ship = cents(opt?.shippingCost?.value);
  const shippingUnknown = ship === null || opt?.shippingCostType === "CALCULATED";
  const buying = s.buyingOptions?.includes("FIXED_PRICE") ? "FIXED_PRICE" : s.buyingOptions?.includes("AUCTION") ? "AUCTION" : s.buyingOptions?.[0] ?? null;
  return {
    source: "EBAY_BROWSE",
    externalId: s.itemId,
    title: s.title,
    url: s.itemWebUrl ?? null,
    imageUrl: s.image?.imageUrl ?? s.thumbnailImages?.[0]?.imageUrl ?? null,
    price,
    shipping: shippingUnknown ? 0 : ship,
    shippingUnknown,
    currency: s.price?.currency ?? "USD",
    condition: s.condition ?? null,
    conditionGrade: ebayConditionToGrade(s.conditionId, s.condition),
    buyingOption: buying,
    listedAt: s.itemCreationDate ? new Date(s.itemCreationDate) : null,
    soldAt: null,
    isMarketEvidence: true,
    raw: { provider: s },
  };
}

export function vocabularyFromBrowse(result: BrowseSearchResult): string[] {
  const out: string[] = [];
  for (const a of result.refinement?.aspectDistributions ?? []) {
    const values = [...a.aspectValueDistributions].sort((x, y) => y.matchCount - x.matchCount).slice(0, 2);
    for (const v of values) out.push(`${a.localizedAspectName}: ${v.localizedAspectValue}`);
  }
  const cats = [...(result.refinement?.categoryDistributions ?? [])].sort((x, y) => y.matchCount - x.matchCount).slice(0, 3);
  for (const c of cats) out.push(c.categoryName);
  out.push(...titleTerms(result.itemSummaries.map((s) => s.title)));
  return [...new Set(out)].slice(0, 40);
}

export class EbayBrowseComps implements CompsProvider {
  readonly name = "ebay" as const;

  async search(profile: ItemProfile, opts: CompsSearchOptions = {}): Promise<CompsSearchResult> {
    const gtin = gtinFromProfile(profile);
    const q = gtin ? null : buildQuery(profile, opts.target);
    const grade = opts.target?.conditionGrade ?? profile.condition.grade;
    const conditionIds = conditionIdsForGrade(grade);
    const params = {
      gtin: gtin ?? undefined,
      q: q ?? undefined,
      conditionIds,
      buyingOptions: ["FIXED_PRICE", "BEST_OFFER", "AUCTION"] as Array<"FIXED_PRICE" | "BEST_OFFER" | "AUCTION">,
      fieldgroups: ["ASPECT_REFINEMENTS", "CATEGORY_REFINEMENTS"] as Array<"ASPECT_REFINEMENTS" | "CATEGORY_REFINEMENTS">,
      limit: Math.min(opts.limit ?? 50, 200),
    };
    let result = await browseSearch(params);
    // A GTIN with no hits usually means the code was misread; fall back to keywords once.
    if (gtin && result.itemSummaries.length === 0) {
      result = await browseSearch({ ...params, gtin: undefined, q: buildQuery(profile, opts.target) });
    }
    const comps = result.itemSummaries.map(mapBrowseSummary).filter((c): c is CompCandidate => c !== null);
    return { provider: "ebay", comps, vocabulary: vocabularyFromBrowse(result), query: { gtin, q: q ?? (gtin && comps.length === 0 ? buildQuery(profile, opts.target) : null), conditionIds }, error: null };
  }
}

// ─────────────────────────── Demo ───────────────────────────

export function demoCompsFromEntry(entry: DemoCatalogEntry, now: Date): CompCandidate[] {
  return entry.comps.map((c, i) => {
    const listedAt = new Date(now.getTime() - c.daysAgo * 86_400_000);
    const soldAt = c.soldDaysAgo !== undefined ? new Date(now.getTime() - c.soldDaysAgo * 86_400_000) : null;
    return {
      source: "DEMO",
      externalId: `demo-${entry.slug}-${i + 1}`,
      title: c.title,
      url: null,
      imageUrl: null,
      price: c.price,
      shipping: c.shipping,
      currency: "USD",
      condition: c.condition,
      conditionGrade: c.conditionGrade,
      buyingOption: c.buyingOption,
      listedAt,
      soldAt,
      isMarketEvidence: false,
      raw: { provider: { demo: true, slug: entry.slug, index: i + 1 } },
    };
  });
}

export class DemoComps implements CompsProvider {
  readonly name = "demo" as const;

  async search(profile: ItemProfile, opts: CompsSearchOptions = {}): Promise<CompsSearchResult> {
    const now = opts.now ?? new Date();
    const q = buildQuery(profile, opts.target);
    const conditionIds = conditionIdsForGrade(opts.target?.conditionGrade ?? profile.condition.grade);
    const entry = matchCatalogByProfile({
      itemName: opts.target?.itemName ? { ...profile.itemName, value: opts.target.itemName } : profile.itemName,
      brand: opts.target?.brand ? { ...(profile.brand ?? profile.itemName), value: opts.target.brand } : profile.brand,
      model: opts.target?.model ? { ...(profile.model ?? profile.itemName), value: opts.target.model } : profile.model,
      categoryPath: profile.categoryPath,
    });
    if (!entry) {
      // Nothing in the catalogue resembles this item: say so rather than inventing comps.
      return { provider: "demo", comps: [], vocabulary: [], query: { gtin: gtinFromProfile(profile), q, conditionIds }, error: null };
    }
    const comps = demoCompsFromEntry(entry, now).slice(0, opts.limit ?? 50);
    const vocabulary = [...new Set([...entry.vocabulary.aspects, ...entry.vocabulary.categories, ...titleTerms(comps.map((c) => c.title))])];
    return { provider: "demo", comps, vocabulary, query: { gtin: gtinFromProfile(profile), q, conditionIds }, error: null };
  }
}

/** Deterministic demo comps for an arbitrary key (used by tests and seeds). */
export function demoCompsForHash(hash: string, now = new Date()): CompCandidate[] {
  return demoCompsFromEntry(catalogByHash(hash), now);
}

// ─────────────────────────── selection ───────────────────────────

/** Browse only needs the application token, so the client id + secret are enough (no RuName). */
export function ebayBrowseConfigured(): boolean {
  return !env.CLOVER_DEMO_MODE && !!env.EBAY_CLIENT_ID?.trim() && !!env.EBAY_CLIENT_SECRET?.trim();
}

export function getCompsProvider(): CompsProvider {
  return ebayBrowseConfigured() ? new EbayBrowseComps() : new DemoComps();
}

/**
 * Searches with the configured provider and falls back to demo comps when eBay fails, recording the
 * failure in `error` so the estimate can say "eBay search was unavailable".
 */
export async function searchComps(profile: ItemProfile, opts: CompsSearchOptions = {}, provider: CompsProvider = getCompsProvider()): Promise<CompsSearchResult> {
  try {
    return await provider.search(profile, opts);
  } catch (err) {
    if (provider.name === "demo") throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[comps] eBay Browse failed, using demo comparables:", message);
    const fallback = await new DemoComps().search(profile, opts);
    return { ...fallback, error: message.slice(0, 200) };
  }
}
