import type { Comp, PriceEstimate } from "../db";
import { compRaw } from "./service";
import type { NetByMarketplace, PricingMethod } from "./types";

/**
 * Client-safe pricing shapes. `method` is the full engine trace (shown in expert mode) and `demo`
 * says whether the comps came from the demo provider rather than a live marketplace search.
 */

export type EstimateDTO = {
  basis: PriceEstimate["basis"];
  confidence: PriceEstimate["confidence"];
  quickSale: number;
  recommended: number;
  maxValue: number;
  low: number;
  likely: number;
  high: number;
  compsUsed: number;
  effectiveSample: number;
  explanation: string;
  method: PricingMethod | null;
  netByMarketplace: NetByMarketplace | null;
  /** "ebay" when the comparables came from a live search, "demo" otherwise, null when unknown. */
  compsProvider: string | null;
  demo: boolean;
  updatedAt: string;
};

export type CompDTO = {
  id: string;
  source: Comp["source"];
  title: string;
  url: string | null;
  imageUrl: string | null;
  price: number;
  shipping: number;
  currency: string;
  condition: string | null;
  conditionGrade: Comp["conditionGrade"];
  buyingOption: string | null;
  listedAt: string | null;
  soldAt: string | null;
  similarity: number;
  included: boolean;
  exclusionReason: string | null;
  isMarketEvidence: boolean;
  userOverride: "include" | "exclude" | null;
};

function methodOf(e: PriceEstimate): PricingMethod | null {
  const m = e.method;
  return m && typeof m === "object" && !Array.isArray(m) && "version" in m ? (m as unknown as PricingMethod) : null;
}

export function toEstimateDTO(e: PriceEstimate): EstimateDTO {
  const method = methodOf(e);
  const net = e.netByMarketplace;
  const provider = method?.provider ?? null;
  return {
    basis: e.basis,
    confidence: e.confidence,
    quickSale: e.quickSale,
    recommended: e.recommended,
    maxValue: e.maxValue,
    low: e.low,
    likely: e.likely,
    high: e.high,
    compsUsed: e.compsUsed,
    effectiveSample: e.effectiveSample,
    explanation: e.explanation,
    method,
    netByMarketplace: net && typeof net === "object" && !Array.isArray(net) ? (net as unknown as NetByMarketplace) : null,
    compsProvider: provider,
    demo: provider !== "ebay",
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function toCompDTO(c: Comp): CompDTO {
  const raw = compRaw(c);
  return {
    id: c.id,
    source: c.source,
    title: c.title,
    url: c.url,
    imageUrl: c.imageUrl,
    price: c.price,
    shipping: c.shipping,
    currency: c.currency,
    condition: c.condition,
    conditionGrade: c.conditionGrade,
    buyingOption: c.buyingOption,
    listedAt: c.listedAt ? c.listedAt.toISOString() : null,
    soldAt: c.soldAt ? c.soldAt.toISOString() : null,
    similarity: c.similarity,
    included: c.included,
    exclusionReason: c.exclusionReason,
    isMarketEvidence: c.isMarketEvidence,
    userOverride: raw.userOverride ?? null,
  };
}

/** Comps ordered the way the drawer shows them: included first, then by similarity. */
export function sortComps(comps: Comp[]): Comp[] {
  return [...comps].sort((a, b) => Number(b.included) - Number(a.included) || b.similarity - a.similarity || a.createdAt.getTime() - b.createdAt.getTime());
}
