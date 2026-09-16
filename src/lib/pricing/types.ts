import type { CompSource, ConditionGrade, ConfidenceTier, EstimateBasis, Marketplace, PricingStrategy } from "../db";

/** A comparable listing as returned by a comps provider, before the engine scores it. */
export type CompCandidate = {
  /** Database id when the candidate came from a persisted `Comp` row. */
  id?: string;
  source: CompSource;
  externalId: string | null;
  title: string;
  url: string | null;
  imageUrl: string | null;
  /** Item price in cents. */
  price: number;
  /** Buyer-paid shipping in cents; 0 when free or unknown (see `shippingUnknown`). */
  shipping: number;
  /** True when the provider could not determine shipping (calculated at checkout, missing). */
  shippingUnknown?: boolean;
  currency?: string;
  condition: string | null;
  conditionGrade: ConditionGrade | null;
  buyingOption: string | null;
  listedAt: Date | null;
  soldAt: Date | null;
  /** True only for real marketplace data. Demo comps are never market evidence. */
  isMarketEvidence: boolean;
  /** Explicit seller decision that overrides the engine's gates. */
  userOverride?: "include" | "exclude" | null;
  raw?: unknown;
};

/** Per-comp result after the engine has run. */
export type ScoredComp = CompCandidate & {
  similarity: number;
  included: boolean;
  exclusionReason: string | null;
  /** Landed price (price + shipping) in cents. */
  landed: number;
  /** Landed price normalised to the target condition grade, in cents (null when excluded). */
  normalized: number | null;
  /** Time-decay × similarity × sold boost weight (null when excluded). */
  weight: number | null;
  ageDays: number | null;
  multiplier: number | null;
};

export type CompsVocabulary = {
  /** e.g. "Brand: Leica", "Film Format: 35mm" */
  aspects: string[];
  /** Dominant category names from refinements. */
  categories: string[];
  /** Frequent tokens across comp titles (already lower-cased). */
  titleTerms: string[];
};

export type PricingTarget = {
  itemName: string;
  brand: string | null;
  model: string | null;
  modelNumber?: string | null;
  keywords?: string[];
  categoryPath: string[];
  conditionGrade: ConditionGrade;
};

export type PricingFallback = {
  /** Conservative prior for the category (cents). */
  medianCents: number;
  /** Where the prior came from, e.g. "demo catalogue: Cameras & Photo" or "rule table: default". */
  source: string;
};

export type PricingOptions = {
  now?: Date;
  /** Seed for the bootstrap PRNG so the same inputs always produce the same band. */
  seed?: number;
  strategy?: PricingStrategy;
  /** Seller's expected outbound shipping cost in cents for shipped-net calculations. */
  shippingCostCents?: number;
  /** Used only when no comps survive the gates. */
  fallback?: PricingFallback | null;
  /** Provider failure to surface in `method.compsError`. */
  compsError?: string | null;
  /** Which provider produced the comps ("ebay" | "demo"). */
  compsProvider?: string | null;
};

export type NetBreakdown = { fees: number; shippingCost: number; net: number };

export type NetByMarketplace = Record<
  Marketplace,
  {
    name: string;
    /** Net when the buyer pays for shipping and the seller ships (null when the marketplace has no shipping). */
    shipped: NetBreakdown | null;
    /** Net for a local hand-off (null when the marketplace has no local option). */
    local: NetBreakdown | null;
    feeNote: string;
  }
>;

export type PricingMethod = {
  version: string;
  provider: string | null;
  compsError: string | null;
  target: PricingTarget;
  similarity: { threshold: number; targetTokens: string[] };
  counts: { candidates: number; afterSimilarity: number; afterLots: number; afterCondition: number; afterIqr: number; included: number; marketEvidence: number; sold: number; userExcluded: number; userIncluded: number };
  iqr: { q1: number; q3: number; iqr: number; lowFence: number; highFence: number } | null;
  conditionMultipliers: { table: Record<ConditionGrade, number>; targetGrade: ConditionGrade; targetMultiplier: number };
  timeDecay: { halfLifeDays: number; lambda: number; soldBoost: number; unknownAgeDays: number };
  askToSold: { ratio: number; applied: boolean; reason: string };
  weightedQuantiles: { p25: number; p50: number; p75: number } | null;
  bootstrap: { samples: number; seed: number; low: number; likely: number; high: number } | null;
  effectiveSample: number;
  landedRange: { min: number; max: number } | null;
  fallback: PricingFallback | null;
  rounding: string;
  confidenceRule: string;
  perComp: Array<{
    id: string | null;
    title: string;
    similarity: number;
    landed: number;
    gradeFrom: ConditionGrade | null;
    multiplier: number | null;
    normalized: number | null;
    ageDays: number | null;
    sold: boolean;
    weight: number | null;
    included: boolean;
    exclusionReason: string | null;
    isMarketEvidence: boolean;
  }>;
};

export type PricingResult = {
  basis: EstimateBasis;
  confidence: ConfidenceTier;
  quickSale: number;
  recommended: number;
  maxValue: number;
  low: number;
  likely: number;
  high: number;
  compsUsed: number;
  effectiveSample: number;
  method: PricingMethod;
  explanation: string;
  netByMarketplace: NetByMarketplace;
  comps: ScoredComp[];
  /** The price point the seller's strategy selects. */
  strategyPrice: number;
};
