import type { ConditionGrade, ConfidenceTier, Marketplace } from "../db";
import { formatMoney, roundToPricePoint } from "../money";
import { CONDITION_LABELS, MARKETPLACES, netProceeds } from "../marketplaces/registry";
import type { CompCandidate, NetByMarketplace, PricingFallback, PricingMethod, PricingOptions, PricingResult, PricingTarget, ScoredComp } from "./types";

/**
 * Deterministic, explainable price estimation (docs/research/04 §2.4).
 *
 *   similarity gate → lots/bundles + for-parts exclusion → landed price → IQR trim
 *   → condition normalisation → time-decay weights → weighted P25/P50/P75
 *   → bootstrap band → ask-to-sold correction → price-point rounding → fee netting
 *
 * Pure: no I/O, no Date.now() unless `now` is omitted, seeded PRNG for the bootstrap.
 * Every intermediate is returned in `method` so the expert panel can show the arithmetic.
 */

export const ENGINE_VERSION = "2026-09-15.1";
export const SIMILARITY_THRESHOLD = 0.35;
export const HALF_LIFE_DAYS = 45;
export const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;
export const SOLD_WEIGHT_BOOST = 2;
export const UNKNOWN_AGE_DAYS = 30;
export const ASK_TO_SOLD_RATIO = 0.9;
export const BOOTSTRAP_SAMPLES = 200;
export const MIN_MARKET_EVIDENCE_COMPS = 3;

/** Category-agnostic prior relative to new-sealed (research §2.4 step 4; calibrate per category from outcomes). */
export const CONDITION_MULTIPLIERS: Record<ConditionGrade, number> = {
  NEW_SEALED: 1.0,
  NEW_OPEN_BOX: 0.92,
  LIKE_NEW: 0.85,
  VERY_GOOD: 0.75,
  GOOD: 0.65,
  FAIR: 0.5,
  FOR_PARTS: 0.3,
};

const LOT_REGEX = /\b(lot of|job lot|bundle of|bundle|wholesale|bulk|\d+\s*(?:pcs|pieces|pack|units|count)\b|x\s?\d{1,2}\b|set of \d+)/i;
const FOR_PARTS_REGEX = /\b(for parts|parts only|not working|as-?is|broken|needs repair|untested lot)\b/i;

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "with", "for", "in", "on", "to", "by", "or", "new", "used", "vintage", "rare", "nice", "great", "excellent", "condition", "free", "shipping", "ship", "fast", "oem", "genuine", "authentic", "original", "look", "wow"]);

function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/(?<=[a-z0-9])-(?=[a-z0-9])/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(s: string | null | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  for (const t of normaliseText(s).split(" ")) {
    if (!t || STOPWORDS.has(t)) continue;
    if (t.length < 2 && !/^\d$/.test(t)) continue;
    if (/^\d$/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export type TargetTokens = { weighted: Array<{ token: string; weight: number }>; all: string[] };

/** Brand and model tokens count double: they decide identity; name tokens describe the type. */
export function targetTokens(target: Pick<PricingTarget, "brand" | "model" | "modelNumber" | "itemName">): TargetTokens {
  const weighted = new Map<string, number>();
  const add = (s: string | null | undefined, w: number) => {
    for (const t of tokenize(s)) weighted.set(t, Math.max(weighted.get(t) ?? 0, w));
  };
  add(target.brand, 2);
  add(target.model, 2);
  add(target.modelNumber ?? null, 2);
  add(target.itemName, 1);
  const list = [...weighted.entries()].map(([token, weight]) => ({ token, weight }));
  return { weighted: list, all: list.map((x) => x.token) };
}

/** Weighted token overlap between the target identity and a comp title, 0–1. */
export function similarityScore(tt: TargetTokens, title: string): number {
  if (tt.weighted.length === 0) return 0;
  const compTokens = new Set(tokenize(title));
  const compJoined = normaliseText(title).replace(/\s+/g, "");
  let matched = 0;
  let total = 0;
  for (const { token, weight } of tt.weighted) {
    total += weight;
    if (compTokens.has(token) || (token.length >= 4 && compJoined.includes(token))) matched += weight;
  }
  return total ? Math.round((matched / total) * 1000) / 1000 : 0;
}

export function isLotOrBundle(title: string): boolean {
  return LOT_REGEX.test(title);
}

export function looksForParts(title: string, grade: ConditionGrade | null): boolean {
  return grade === "FOR_PARTS" || FOR_PARTS_REGEX.test(title);
}

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted quantile with linear interpolation between mid-cumulative positions. */
export function weightedQuantile(values: number[], weights: number[], q: number): number {
  if (values.length === 0) return 0;
  const idx = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const v = idx.map((i) => values[i]!);
  const w = idx.map((i) => weights[i]!);
  const total = w.reduce((s, x) => s + x, 0);
  if (total <= 0) return v[Math.floor((v.length - 1) * q)]!;
  let cum = 0;
  const pos: number[] = [];
  for (const wi of w) {
    pos.push((cum + wi / 2) / total);
    cum += wi;
  }
  if (q <= pos[0]!) return v[0]!;
  if (q >= pos[pos.length - 1]!) return v[v.length - 1]!;
  for (let i = 1; i < pos.length; i++) {
    if (q <= pos[i]!) {
      const span = pos[i]! - pos[i - 1]!;
      const t = span > 0 ? (q - pos[i - 1]!) / span : 0;
      return v[i - 1]! + t * (v[i]! - v[i - 1]!);
    }
  }
  return v[v.length - 1]!;
}

export function plainQuantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const p = (s.length - 1) * q;
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  return s[lo]! + (s[hi]! - s[lo]!) * (p - lo);
}

export function effectiveSampleSize(weights: number[]): number {
  const sum = weights.reduce((s, w) => s + w, 0);
  const sumSq = weights.reduce((s, w) => s + w * w, 0);
  if (sumSq === 0) return 0;
  return Math.round(((sum * sum) / sumSq) * 100) / 100;
}

export function confidenceTierFor(effectiveSample: number, basis: PricingResult["basis"]): ConfidenceTier {
  if (effectiveSample <= 0) return "NEEDS_CHECK";
  const raw: ConfidenceTier = effectiveSample >= 8 ? "CONFIDENT" : effectiveSample >= 4 ? "LIKELY" : "NEEDS_CHECK";
  if (basis === "AI_ESTIMATE" && raw === "CONFIDENT") return "LIKELY";
  return raw;
}

/** Per-marketplace take-home at a price. Shipped assumes the buyer pays no extra for shipping (price is the landed price). */
export function netByMarketplaceAt(priceCents: number, shippingCostCents = 0): NetByMarketplace {
  const out = {} as NetByMarketplace;
  for (const m of Object.keys(MARKETPLACES) as Marketplace[]) {
    const info = MARKETPLACES[m];
    out[m] = {
      name: info.name,
      shipped: info.supportsShipping ? netProceeds(m, priceCents, { shippingCents: 0, shippingCostCents }) : null,
      local: info.supportsLocal ? netProceeds(m, priceCents, { local: true }) : null,
      feeNote: info.fees.note,
    };
  }
  return out;
}

/** Rule-table prior when no comps survive and the caller has no better fallback. */
export function fallbackPriorFor(categoryPath: string[]): PricingFallback {
  const top = (categoryPath[0] ?? "").toLowerCase();
  const table: Array<[RegExp, number, string]> = [
    [/camera|photo/, 15000, "Cameras & Photo"],
    [/computer|electronic|phone|video game|console/, 9000, "Electronics"],
    [/clothing|shoes|apparel|fashion|accessor/, 3500, "Clothing & Accessories"],
    [/handbag|bag|luxury/, 12000, "Bags & Luxury"],
    [/furniture|home|decor|lamp|lighting/, 7000, "Home & Furniture"],
    [/kitchen|appliance/, 6000, "Kitchen & Appliances"],
    [/tool|hardware/, 5000, "Tools"],
    [/sport|bike|bicycle|cycling|outdoor/, 9000, "Sporting Goods"],
    [/toy|lego|game|hobby/, 3500, "Toys & Hobbies"],
    [/music|instrument/, 12000, "Musical Instruments"],
  ];
  for (const [re, cents, label] of table) if (re.test(top)) return { medianCents: cents, source: `rule table: ${label}` };
  return { medianCents: 4000, source: "rule table: default" };
}

function conditionLabelLower(grade: ConditionGrade): string {
  const label = CONDITION_LABELS[grade].generic;
  return grade === "FOR_PARTS" ? "for parts" : label.charAt(0).toLowerCase() + label.slice(1);
}

function monotone3(a: number, b: number, c: number): [number, number, number] {
  const lo = Math.min(a, b);
  const mid = Math.max(lo, Math.min(b, c));
  const hi = Math.max(mid, c);
  return [lo, mid, hi];
}

function buildExplanation(input: {
  recommended: number;
  landedRange: { min: number; max: number } | null;
  grade: ConditionGrade;
  included: number;
  sold: number;
  basis: PricingResult["basis"];
  marketEvidence: number;
  fallback: PricingFallback | null;
  categoryPath: string[];
  compsError: string | null;
  demoComps: boolean;
}): string {
  const price = formatMoney(input.recommended, "USD", { compact: true });
  const cond = conditionLabelLower(input.grade);
  if (input.included === 0 || !input.landedRange) {
    const cat = input.categoryPath[0] ? ` from the category (${input.categoryPath[0]})` : "";
    const src = input.fallback ? ` and a conservative prior (${input.fallback.source})` : "";
    let s = `Estimated at ${price} without comparable listings. This is an AI estimate${cat}${src}, assuming ${cond} condition — check it against live listings before publishing.`;
    if (input.compsError) s += ` eBay search was unavailable (${input.compsError}).`;
    return s;
  }
  const lo = formatMoney(input.landedRange.min, "USD", { compact: true });
  const hi = formatMoney(input.landedRange.max, "USD", { compact: true });
  const active = input.included - input.sold;
  const count =
    input.sold > 0
      ? `${input.included} similar listings were found (${input.sold} sold recently, ${active} active)`
      : `${input.included} similar listing${input.included === 1 ? " is" : "s are"} active`;
  let s = `Recommended at ${price} because comparable items are listed between ${lo}–${hi}, yours appears to be in ${cond} condition, and ${count}.`;
  if (input.basis === "AI_ESTIMATE") {
    if (input.demoComps) s += " These are demo comparables, not market evidence, so this is an AI estimate.";
    else s += ` Only ${input.marketEvidence} of them are market evidence, so this is an AI estimate.`;
  }
  if (input.compsError) s += ` eBay search was unavailable (${input.compsError}), so the estimate uses demo comparables.`;
  return s;
}

/**
 * Run the estimation. Comps with `userOverride: "exclude"` are dropped before any gate; comps with
 * `userOverride: "include"` bypass the similarity, lot and IQR gates (the seller has looked at them).
 */
export function estimatePrice(target: PricingTarget, candidates: CompCandidate[], options: PricingOptions = {}): PricingResult {
  const now = options.now ?? new Date();
  const seed = options.seed ?? 20260915;
  const tt = targetTokens(target);
  const targetMult = CONDITION_MULTIPLIERS[target.conditionGrade];

  // 1) similarity + explicit overrides
  const scored: ScoredComp[] = candidates.map((c) => {
    const similarity = similarityScore(tt, c.title);
    const landed = Math.max(0, Math.round(c.price + (c.shipping ?? 0)));
    return { ...c, similarity, landed, included: true, exclusionReason: null, normalized: null, weight: null, ageDays: null, multiplier: null };
  });
  let userExcluded = 0;
  let userIncluded = 0;
  for (const c of scored) {
    if (c.userOverride === "exclude") {
      c.included = false;
      c.exclusionReason = "Excluded by you";
      userExcluded++;
    } else if (c.userOverride === "include") {
      userIncluded++;
    }
  }
  const forced = (c: ScoredComp) => c.userOverride === "include";
  for (const c of scored) {
    if (!c.included || forced(c)) continue;
    if (c.similarity < SIMILARITY_THRESHOLD) {
      c.included = false;
      c.exclusionReason = `Low similarity (${Math.round(c.similarity * 100)}% of identity terms matched)`;
    }
  }
  const afterSimilarity = scored.filter((c) => c.included).length;

  // 2) lots / bundles / for-parts
  for (const c of scored) {
    if (!c.included || forced(c)) continue;
    if (isLotOrBundle(c.title)) {
      c.included = false;
      c.exclusionReason = "Lot or bundle, not a single item";
    } else if (target.conditionGrade !== "FOR_PARTS" && looksForParts(c.title, c.conditionGrade)) {
      c.included = false;
      c.exclusionReason = "Listed for parts / not working";
    }
  }
  const afterLots = scored.filter((c) => c.included).length;
  const afterCondition = afterLots;

  // 3) IQR trim on landed prices (only among still-included, non-forced comps)
  let iqr: PricingMethod["iqr"] = null;
  const trimPool = scored.filter((c) => c.included && !forced(c));
  if (trimPool.length >= 4) {
    const landed = trimPool.map((c) => c.landed);
    const q1 = plainQuantile(landed, 0.25);
    const q3 = plainQuantile(landed, 0.75);
    const spread = q3 - q1;
    const lowFence = q1 - 1.5 * spread;
    const highFence = q3 + 1.5 * spread;
    iqr = { q1: Math.round(q1), q3: Math.round(q3), iqr: Math.round(spread), lowFence: Math.round(lowFence), highFence: Math.round(highFence) };
    for (const c of trimPool) {
      if (c.landed < lowFence) {
        c.included = false;
        c.exclusionReason = `Price outlier: below ${formatMoney(Math.round(lowFence), "USD", { compact: true })}`;
      } else if (c.landed > highFence) {
        c.included = false;
        c.exclusionReason = `Price outlier: above ${formatMoney(Math.round(highFence), "USD", { compact: true })}`;
      }
    }
  }
  const afterIqr = scored.filter((c) => c.included).length;

  // 4) condition normalisation + 5) time-decay weights
  for (const c of scored) {
    if (!c.included) continue;
    const from = c.conditionGrade;
    const mult = from ? targetMult / CONDITION_MULTIPLIERS[from] : 1;
    c.multiplier = Math.round(mult * 1000) / 1000;
    c.normalized = Math.round(c.landed * mult);
    const when = c.soldAt ?? c.listedAt;
    const age = when ? Math.max(0, (now.getTime() - when.getTime()) / 86_400_000) : UNKNOWN_AGE_DAYS;
    c.ageDays = Math.round(age * 10) / 10;
    const sim = Math.max(c.similarity, forced(c) ? SIMILARITY_THRESHOLD : c.similarity);
    const w = sim * Math.exp(-LAMBDA * age) * (c.soldAt ? SOLD_WEIGHT_BOOST : 1);
    c.weight = Math.round(w * 10000) / 10000;
  }

  const included = scored.filter((c) => c.included && c.normalized !== null && c.weight !== null);
  const marketEvidence = included.filter((c) => c.isMarketEvidence).length;
  const sold = included.filter((c) => c.soldAt).length;
  const demoComps = candidates.length > 0 && candidates.every((c) => c.source === "DEMO");

  const baseMethod: Omit<PricingMethod, "weightedQuantiles" | "bootstrap" | "effectiveSample" | "landedRange" | "fallback" | "askToSold" | "confidenceRule"> = {
    version: ENGINE_VERSION,
    provider: options.compsProvider ?? null,
    compsError: options.compsError ?? null,
    target,
    similarity: { threshold: SIMILARITY_THRESHOLD, targetTokens: tt.all },
    counts: { candidates: candidates.length, afterSimilarity, afterLots, afterCondition, afterIqr, included: included.length, marketEvidence, sold, userExcluded, userIncluded },
    iqr,
    conditionMultipliers: { table: CONDITION_MULTIPLIERS, targetGrade: target.conditionGrade, targetMultiplier: targetMult },
    timeDecay: { halfLifeDays: HALF_LIFE_DAYS, lambda: Math.round(LAMBDA * 1e6) / 1e6, soldBoost: SOLD_WEIGHT_BOOST, unknownAgeDays: UNKNOWN_AGE_DAYS },
    rounding: "roundToPricePoint: $x.99 under $50, whole dollars under $200, $5 steps above",
    perComp: scored.map((c) => ({
      id: c.id ?? null,
      title: c.title,
      similarity: c.similarity,
      landed: c.landed,
      gradeFrom: c.conditionGrade,
      multiplier: c.multiplier,
      normalized: c.normalized,
      ageDays: c.ageDays,
      sold: !!c.soldAt,
      weight: c.weight,
      included: c.included,
      exclusionReason: c.exclusionReason,
      isMarketEvidence: c.isMarketEvidence,
    })),
  };

  // Zero comps → AI estimate from a conservative prior.
  if (included.length === 0) {
    const fallback = options.fallback ?? fallbackPriorFor(target.categoryPath);
    const median = Math.max(100, Math.round(fallback.medianCents * (targetMult / CONDITION_MULTIPLIERS.VERY_GOOD)));
    const [quickSale, recommended, maxValue] = monotone3(roundToPricePoint(median * 0.8), roundToPricePoint(median), roundToPricePoint(median * 1.25));
    const [low, likely, high] = monotone3(roundToPricePoint(median * 0.6), roundToPricePoint(median), roundToPricePoint(median * 1.5));
    const method: PricingMethod = {
      ...baseMethod,
      askToSold: { ratio: ASK_TO_SOLD_RATIO, applied: false, reason: "No comparables" },
      weightedQuantiles: null,
      bootstrap: null,
      effectiveSample: 0,
      landedRange: null,
      fallback,
      confidenceRule: "No comparables → NEEDS_CHECK",
    };
    const explanation = buildExplanation({ recommended, landedRange: null, grade: target.conditionGrade, included: 0, sold: 0, basis: "AI_ESTIMATE", marketEvidence: 0, fallback, categoryPath: target.categoryPath, compsError: options.compsError ?? null, demoComps });
    return {
      basis: "AI_ESTIMATE",
      confidence: "NEEDS_CHECK",
      quickSale,
      recommended,
      maxValue,
      low,
      likely,
      high,
      compsUsed: 0,
      effectiveSample: 0,
      method,
      explanation,
      netByMarketplace: netByMarketplaceAt(recommended, options.shippingCostCents ?? 0),
      comps: scored,
      strategyPrice: pickStrategy(options.strategy, quickSale, recommended, maxValue),
    };
  }

  // 6) weighted quantiles
  const values = included.map((c) => c.normalized!);
  const weights = included.map((c) => c.weight!);
  const p25 = weightedQuantile(values, weights, 0.25);
  const p50 = weightedQuantile(values, weights, 0.5);
  const p75 = weightedQuantile(values, weights, 0.75);

  // Bootstrap band: resample the weighted set 200× (seeded), track the spread of each quantile.
  const rand = mulberry32(seed);
  const cum: number[] = [];
  let acc = 0;
  for (const w of weights) {
    acc += w;
    cum.push(acc);
  }
  const draw = () => {
    const r = rand() * acc;
    let i = 0;
    while (i < cum.length - 1 && cum[i]! < r) i++;
    return i;
  };
  const b25: number[] = [];
  const b50: number[] = [];
  const b75: number[] = [];
  for (let s = 0; s < BOOTSTRAP_SAMPLES; s++) {
    const sv: number[] = [];
    const sw: number[] = [];
    for (let k = 0; k < included.length; k++) {
      const i = draw();
      sv.push(values[i]!);
      sw.push(weights[i]!);
    }
    b25.push(weightedQuantile(sv, sw, 0.25));
    b50.push(weightedQuantile(sv, sw, 0.5));
    b75.push(weightedQuantile(sv, sw, 0.75));
  }
  const bandLow = Math.min(plainQuantile(b25, 0.1), p25);
  const bandLikely = plainQuantile(b50, 0.5);
  const bandHigh = Math.max(plainQuantile(b75, 0.9), p75);

  // 7) ask-to-sold correction when every included comp is an active ask
  const askOnly = sold === 0;
  const ratio = askOnly ? ASK_TO_SOLD_RATIO : 1;

  const effectiveSample = effectiveSampleSize(weights);
  const basis: PricingResult["basis"] = marketEvidence >= MIN_MARKET_EVIDENCE_COMPS ? "MARKET_EVIDENCE" : "AI_ESTIMATE";
  const confidence = confidenceTierFor(effectiveSample, basis);

  const [quickSale, recommended, maxValue] = monotone3(roundToPricePoint(p25 * ratio), roundToPricePoint(p50 * ratio), roundToPricePoint(p75 * ratio));
  const [low, likely, high] = monotone3(roundToPricePoint(bandLow * ratio), roundToPricePoint(bandLikely * ratio), roundToPricePoint(bandHigh * ratio));

  const landedRange = { min: Math.min(...included.map((c) => c.landed)), max: Math.max(...included.map((c) => c.landed)) };
  const method: PricingMethod = {
    ...baseMethod,
    askToSold: { ratio: ASK_TO_SOLD_RATIO, applied: askOnly, reason: askOnly ? "All comparables are active asks; asks run above realised prices" : "Sold comparables present; no correction" },
    weightedQuantiles: { p25: Math.round(p25), p50: Math.round(p50), p75: Math.round(p75) },
    bootstrap: { samples: BOOTSTRAP_SAMPLES, seed, low: Math.round(bandLow), likely: Math.round(bandLikely), high: Math.round(bandHigh) },
    effectiveSample,
    landedRange,
    fallback: null,
    confidenceRule: `effective sample ${effectiveSample} → ${effectiveSample >= 8 ? "≥8 CONFIDENT" : effectiveSample >= 4 ? "≥4 LIKELY" : "<4 NEEDS_CHECK"}${basis === "AI_ESTIMATE" ? "; capped at LIKELY without market evidence" : ""}`,
  };
  const explanation = buildExplanation({ recommended, landedRange, grade: target.conditionGrade, included: included.length, sold, basis, marketEvidence, fallback: null, categoryPath: target.categoryPath, compsError: options.compsError ?? null, demoComps });

  return {
    basis,
    confidence,
    quickSale,
    recommended,
    maxValue,
    low,
    likely,
    high,
    compsUsed: included.length,
    effectiveSample,
    method,
    explanation,
    netByMarketplace: netByMarketplaceAt(recommended, options.shippingCostCents ?? 0),
    comps: scored,
    strategyPrice: pickStrategy(options.strategy, quickSale, recommended, maxValue),
  };
}

export function pickStrategy(strategy: PricingOptions["strategy"], quickSale: number, recommended: number, maxValue: number): number {
  if (strategy === "QUICK_SALE") return quickSale;
  if (strategy === "MAX_VALUE") return maxValue;
  return recommended;
}
