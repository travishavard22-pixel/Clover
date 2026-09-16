import { ItemProfileSchema, type ItemProfile } from "../ai/schemas";
import { catalogFallbackForCategory } from "../demo/catalog";
import { db, Prisma, type Comp, type Item, type PriceEstimate, type PricingStrategy } from "../db";
import { ApiError } from "../api";
import { searchComps, type CompsProvider, type CompsSearchResult } from "./comps";
import { estimatePrice, fallbackPriorFor } from "./engine";
import type { CompCandidate, PricingResult, PricingTarget } from "./types";

/**
 * Persistence layer around the pure engine: turns `Comp` rows into candidates, runs the estimate,
 * writes the per-comp verdicts back, upserts `PriceEstimate` and mirrors the recommendation onto
 * the item. Used by the ANALYZE_ITEM job and by the recalculate / comp-toggle routes.
 */

export type CompRaw = { provider?: unknown; userOverride?: "include" | "exclude" | null };

export function compRaw(c: Pick<Comp, "raw">): CompRaw {
  return c.raw && typeof c.raw === "object" && !Array.isArray(c.raw) ? (c.raw as CompRaw) : {};
}

export function compRowToCandidate(c: Comp): CompCandidate {
  const raw = compRaw(c);
  return {
    id: c.id,
    source: c.source,
    externalId: c.externalId,
    title: c.title,
    url: c.url,
    imageUrl: c.imageUrl,
    price: c.price,
    shipping: c.shipping,
    currency: c.currency,
    condition: c.condition,
    conditionGrade: c.conditionGrade,
    buyingOption: c.buyingOption,
    listedAt: c.listedAt,
    soldAt: c.soldAt,
    isMarketEvidence: c.isMarketEvidence,
    userOverride: raw.userOverride ?? null,
    raw,
  };
}

export function parseProfile(data: unknown): ItemProfile | null {
  const r = ItemProfileSchema.safeParse(data);
  return r.success ? r.data : null;
}

/** The seller's edits (mirrored on the item) win over the profile. */
export function pricingTargetFor(item: Pick<Item, "title" | "brand" | "model" | "categoryPath" | "conditionGrade">, profile: ItemProfile | null): PricingTarget {
  const titled = item.title && item.title !== "Untitled item" ? item.title : null;
  return {
    itemName: titled ?? profile?.itemName.value ?? item.title,
    brand: item.brand ?? profile?.brand?.value ?? null,
    model: item.model ?? profile?.model?.value ?? null,
    modelNumber: profile?.modelNumber?.value ?? null,
    keywords: profile?.searchKeywords ?? [],
    categoryPath: item.categoryPath.length ? item.categoryPath : profile?.categoryPath ?? [],
    conditionGrade: item.conditionGrade ?? profile?.condition.grade ?? "GOOD",
  };
}

/** Replaces the item's provider comps (seller-reported comps are kept) with a fresh search. */
export async function refreshComps(item: Item, profile: ItemProfile, opts: { now?: Date; provider?: CompsProvider } = {}): Promise<{ result: CompsSearchResult; rows: Comp[] }> {
  const target = pricingTargetFor(item, profile);
  const result = await searchComps(profile, { now: opts.now, target: { itemName: target.itemName, brand: target.brand, model: target.model, conditionGrade: target.conditionGrade } }, opts.provider);
  await db.$transaction([
    db.comp.deleteMany({ where: { itemId: item.id, source: { not: "USER_REPORTED" } } }),
    db.comp.createMany({
      data: result.comps.map((c) => ({
        itemId: item.id,
        source: c.source,
        externalId: c.externalId,
        title: c.title,
        url: c.url,
        imageUrl: c.imageUrl,
        price: c.price,
        shipping: c.shipping,
        currency: c.currency ?? "USD",
        condition: c.condition,
        conditionGrade: c.conditionGrade,
        buyingOption: c.buyingOption,
        listedAt: c.listedAt,
        soldAt: c.soldAt,
        isMarketEvidence: c.isMarketEvidence,
        raw: (c.raw ?? {}) as Prisma.InputJsonValue,
      })),
    }),
  ]);
  const rows = await db.comp.findMany({ where: { itemId: item.id }, orderBy: { createdAt: "asc" } });
  return { result, rows };
}

export type CompsMeta = { provider: CompsSearchResult["provider"]; vocabulary: string[]; query: CompsSearchResult["query"] | null; error: string | null };

export type RecomputeOptions = {
  now?: Date;
  strategy?: PricingStrategy;
  /** From the comps search that produced the rows; persisted into `method`. */
  comps?: CompsMeta | null;
  /** Also set `item.listPrice` when it is empty (first analysis). */
  setListPriceIfEmpty?: boolean;
};

export type RecomputeOutcome = { estimate: PriceEstimate; comps: Comp[]; result: PricingResult };

/** The subset of a stored `method` JSON we read back on recalculation. */
type StoredMethodMeta = { provider?: string | null; vocabulary?: string[]; query?: CompsSearchResult["query"] | null; compsError?: string | null };

/** Runs the engine over the item's stored comps and persists everything. */
export async function recomputeEstimate(itemId: string, opts: RecomputeOptions = {}): Promise<RecomputeOutcome> {
  const item = await db.item.findUnique({ where: { id: itemId }, include: { profile: true, comps: { orderBy: { createdAt: "asc" } }, estimate: true, user: { select: { preferences: { select: { pricingStrategy: true } } } } } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  const profile = item.profile ? parseProfile(item.profile.data) : null;
  const target = pricingTargetFor(item, profile);
  const previous = (item.estimate?.method ?? null) as StoredMethodMeta | null;
  const compsMeta: CompsMeta | null =
    opts.comps ?? (previous ? { provider: previous.provider === "ebay" ? "ebay" : "demo", vocabulary: previous.vocabulary ?? [], query: previous.query ?? null, error: previous.compsError ?? null } : null);

  const candidates = item.comps.map(compRowToCandidate);
  const fallback = catalogFallbackForCategory(target.categoryPath) ?? fallbackPriorFor(target.categoryPath);
  const result = estimatePrice(target, candidates, {
    now: opts.now,
    seed: seedFor(itemId),
    strategy: opts.strategy ?? item.user.preferences?.pricingStrategy ?? "BALANCED",
    shippingCostCents: item.shippingCost ?? 0,
    fallback,
    compsError: compsMeta?.error ?? null,
    compsProvider: compsMeta?.provider ?? null,
    vocabulary: compsMeta?.vocabulary ?? [],
    query: compsMeta?.query ?? null,
  });

  const compUpdates = result.comps
    .filter((c) => c.id)
    .map((c) => db.comp.update({ where: { id: c.id! }, data: { similarity: c.similarity, included: c.included, exclusionReason: c.exclusionReason } }));

  const estimateData = {
    basis: result.basis,
    confidence: result.confidence,
    quickSale: result.quickSale,
    recommended: result.recommended,
    maxValue: result.maxValue,
    low: result.low,
    likely: result.likely,
    high: result.high,
    compsUsed: result.compsUsed,
    effectiveSample: result.effectiveSample,
    method: result.method as unknown as Prisma.InputJsonValue,
    explanation: result.explanation,
    netByMarketplace: result.netByMarketplace as unknown as Prisma.InputJsonValue,
  };

  const itemData: Prisma.ItemUpdateInput = { estimatedValue: result.recommended };
  if (opts.setListPriceIfEmpty && item.listPrice === null) itemData.listPrice = result.strategyPrice;

  const [estimate] = await db.$transaction([
    db.priceEstimate.upsert({ where: { itemId }, create: { itemId, ...estimateData }, update: estimateData }),
    db.item.update({ where: { id: itemId }, data: itemData }),
    ...compUpdates,
  ]);
  const comps = await db.comp.findMany({ where: { itemId }, orderBy: [{ included: "desc" }, { similarity: "desc" }, { createdAt: "asc" }] });
  return { estimate, comps, result };
}

/** Records the seller's include/exclude decision on a comp and recomputes. */
export async function setCompOverride(itemId: string, compId: string, included: boolean): Promise<RecomputeOutcome> {
  const comp = await db.comp.findFirst({ where: { id: compId, itemId } });
  if (!comp) throw new ApiError(404, "Comparable not found", "not_found");
  const raw: CompRaw = { ...compRaw(comp), userOverride: included ? "include" : "exclude" };
  await db.comp.update({ where: { id: compId }, data: { raw: raw as Prisma.InputJsonValue } });
  return recomputeEstimate(itemId);
}

/** Stable per-item bootstrap seed so a recalculation with the same inputs yields the same band. */
export function seedFor(itemId: string): number {
  let h = 2166136261;
  for (let i = 0; i < itemId.length; i++) h = Math.imul(h ^ itemId.charCodeAt(i), 16777619) >>> 0;
  return h;
}
