import type { Marketplace, ConditionGrade } from "../db";

export type MarketplaceInfo = {
  id: Marketplace;
  name: string;
  shortName: string;
  /** api = official write API; assisted = human completes publishing on the marketplace's own site */
  mode: "api" | "assisted" | "api_or_assisted";
  /** Why the mode is what it is — shown to the user, never hidden. */
  modeExplanation: string;
  createUrl: string | null;
  color: string;
  supportsShipping: boolean;
  supportsLocal: boolean;
  supportsOffersApi: boolean;
  supportsMessagesApi: boolean;
  limits: { titleMax: number; descriptionMax: number; photosMax: number; titleVerified: boolean };
  fees: { rate: number; fixedCents: number; minFeeCents: number; appliesToShipping: boolean; localFree: boolean; note: string };
  tier: "primary" | "secondary";
};

export const MARKETPLACES: Record<Marketplace, MarketplaceInfo> = {
  EBAY: {
    id: "EBAY",
    name: "eBay",
    shortName: "eBay",
    mode: "api",
    modeExplanation: "eBay offers official Sell APIs. Clover publishes, updates, ends listings and reads orders and offers through them.",
    createUrl: "https://www.ebay.com/sl/sell",
    color: "oklch(0.55 0.2 260)",
    supportsShipping: true,
    supportsLocal: true,
    supportsOffersApi: true,
    supportsMessagesApi: true,
    limits: { titleMax: 80, descriptionMax: 4000, photosMax: 24, titleVerified: true },
    fees: { rate: 0.136, fixedCents: 40, minFeeCents: 0, appliesToShipping: true, localFree: false, note: "13.6% final value fee + $0.40 per order for most categories (re-verify per category)." },
    tier: "primary",
  },
  FACEBOOK: {
    id: "FACEBOOK",
    name: "Facebook Marketplace",
    shortName: "Facebook",
    mode: "assisted",
    modeExplanation: "Meta does not offer a listing API for individual sellers. Clover prepares everything; you post it in Facebook yourself in about a minute.",
    createUrl: "https://www.facebook.com/marketplace/create/item",
    color: "oklch(0.55 0.18 255)",
    supportsShipping: true,
    supportsLocal: true,
    supportsOffersApi: false,
    supportsMessagesApi: false,
    limits: { titleMax: 100, descriptionMax: 5000, photosMax: 10, titleVerified: false },
    fees: { rate: 0.1, fixedCents: 0, minFeeCents: 80, appliesToShipping: true, localFree: true, note: "10% on shipped checkout orders (min $0.80); local pickup is free." },
    tier: "primary",
  },
  OFFERUP: {
    id: "OFFERUP",
    name: "OfferUp",
    shortName: "OfferUp",
    mode: "assisted",
    modeExplanation: "OfferUp has no public API and its terms prohibit third-party posting tools. Clover prepares the listing; you post it in OfferUp yourself.",
    createUrl: "https://offerup.com/post",
    color: "oklch(0.62 0.2 150)",
    supportsShipping: true,
    supportsLocal: true,
    supportsOffersApi: false,
    supportsMessagesApi: false,
    limits: { titleMax: 80, descriptionMax: 1000, photosMax: 12, titleVerified: false },
    fees: { rate: 0.129, fixedCents: 0, minFeeCents: 199, appliesToShipping: false, localFree: true, note: "12.9% on shipped sales (min $1.99); local is free." },
    tier: "primary",
  },
  NEXTDOOR: {
    id: "NEXTDOOR",
    name: "Nextdoor",
    shortName: "Nextdoor",
    mode: "api_or_assisted",
    modeExplanation: "Nextdoor's Publish API can create For Sale & Free listings but access is granted case-by-case. Until Clover's access is approved you post it yourself.",
    createUrl: "https://nextdoor.com/for_sale_and_free/",
    color: "oklch(0.6 0.15 150)",
    supportsShipping: false,
    supportsLocal: true,
    supportsOffersApi: false,
    supportsMessagesApi: false,
    limits: { titleMax: 80, descriptionMax: 8000, photosMax: 10, titleVerified: false },
    fees: { rate: 0, fixedCents: 0, minFeeCents: 0, appliesToShipping: false, localFree: true, note: "No selling fees." },
    tier: "primary",
  },
  CRAIGSLIST: {
    id: "CRAIGSLIST",
    name: "Craigslist",
    shortName: "Craigslist",
    mode: "assisted",
    modeExplanation: "Craigslist has no API and forbids posting tools. Clover prepares the text; you post it yourself.",
    createUrl: "https://post.craigslist.org/",
    color: "oklch(0.55 0.15 290)",
    supportsShipping: false,
    supportsLocal: true,
    supportsOffersApi: false,
    supportsMessagesApi: false,
    limits: { titleMax: 70, descriptionMax: 8000, photosMax: 24, titleVerified: false },
    fees: { rate: 0, fixedCents: 0, minFeeCents: 0, appliesToShipping: false, localFree: true, note: "Free for most categories." },
    tier: "secondary",
  },
  MERCARI: {
    id: "MERCARI",
    name: "Mercari",
    shortName: "Mercari",
    mode: "assisted",
    modeExplanation: "Mercari US has no public seller API. Clover prepares the listing; you post it yourself.",
    createUrl: "https://www.mercari.com/sell/",
    color: "oklch(0.62 0.2 30)",
    supportsShipping: true,
    supportsLocal: true,
    supportsOffersApi: false,
    supportsMessagesApi: false,
    limits: { titleMax: 80, descriptionMax: 1000, photosMax: 12, titleVerified: false },
    fees: { rate: 0.1, fixedCents: 0, minFeeCents: 0, appliesToShipping: true, localFree: false, note: "10% selling fee (2026)." },
    tier: "secondary",
  },
  POSHMARK: {
    id: "POSHMARK",
    name: "Poshmark",
    shortName: "Poshmark",
    mode: "assisted",
    modeExplanation: "Poshmark has no public API and bans automation tools. Clover prepares the listing; you post it yourself.",
    createUrl: "https://poshmark.com/create-listing",
    color: "oklch(0.6 0.2 350)",
    supportsShipping: true,
    supportsLocal: false,
    supportsOffersApi: false,
    supportsMessagesApi: false,
    limits: { titleMax: 50, descriptionMax: 500, photosMax: 16, titleVerified: false },
    fees: { rate: 0.2, fixedCents: 0, minFeeCents: 295, appliesToShipping: false, localFree: false, note: "$2.95 flat under $15, otherwise 20%." },
    tier: "secondary",
  },
};

export const PRIMARY_MARKETPLACES: Marketplace[] = ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR"];
export const ALL_MARKETPLACES = Object.keys(MARKETPLACES) as Marketplace[];

/** Client-safe type guard (the one in ./index pulls in db/env). */
export function isMarketplaceId(value: string): value is Marketplace {
  return Object.prototype.hasOwnProperty.call(MARKETPLACES, value);
}

/** Fee netting. `shippingCents` is buyer-paid shipping (included in fee basis where the marketplace charges on it). */
export function estimateFees(marketplace: Marketplace, priceCents: number, opts: { shippingCents?: number; local?: boolean } = {}): number {
  const f = MARKETPLACES[marketplace].fees;
  if (opts.local && f.localFree) return 0;
  if (marketplace === "POSHMARK") return priceCents < 1500 ? 295 : Math.round(priceCents * 0.2);
  const basis = priceCents + (f.appliesToShipping ? opts.shippingCents ?? 0 : 0);
  const fee = Math.round(basis * f.rate) + f.fixedCents;
  return Math.max(fee, f.minFeeCents);
}

export function netProceeds(marketplace: Marketplace, priceCents: number, opts: { shippingCents?: number; local?: boolean; shippingCostCents?: number } = {}) {
  const fees = estimateFees(marketplace, priceCents, opts);
  const shippingCost = opts.local ? 0 : opts.shippingCostCents ?? 0;
  return { fees, shippingCost, net: priceCents - fees - shippingCost };
}

/** Human labels for our condition grades, per marketplace vocabulary. */
export const CONDITION_LABELS: Record<ConditionGrade, { generic: string; ebayId: number; ebayName: string; facebook: string; offerup: string; mercari: string; poshmark: string }> = {
  NEW_SEALED: { generic: "New, sealed", ebayId: 1000, ebayName: "New", facebook: "New", offerup: "New (never used)", mercari: "New", poshmark: "New with tags" },
  NEW_OPEN_BOX: { generic: "New, open box", ebayId: 1500, ebayName: "Open box", facebook: "New", offerup: "Open box (never used)", mercari: "Like new", poshmark: "New without tags" },
  LIKE_NEW: { generic: "Like new", ebayId: 2750, ebayName: "Like New", facebook: "Used - like new", offerup: "Reconditioned/Certified", mercari: "Like new", poshmark: "Excellent used condition" },
  VERY_GOOD: { generic: "Very good", ebayId: 4000, ebayName: "Very Good", facebook: "Used - good", offerup: "Used (normal wear)", mercari: "Good", poshmark: "Good used condition" },
  GOOD: { generic: "Good", ebayId: 5000, ebayName: "Good", facebook: "Used - good", offerup: "Used (normal wear)", mercari: "Good", poshmark: "Good used condition" },
  FAIR: { generic: "Fair", ebayId: 6000, ebayName: "Acceptable", facebook: "Used - fair", offerup: "Used (normal wear)", mercari: "Fair", poshmark: "Fair used condition" },
  FOR_PARTS: { generic: "For parts / not working", ebayId: 7000, ebayName: "For parts or not working", facebook: "Used - fair", offerup: "For parts", mercari: "Poor", poshmark: "Fair used condition" },
};

/** Trim a title to a marketplace limit at a word boundary; never cut mid-word unless unavoidable. */
export function fitTitle(title: string, max: number): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const idx = cut.lastIndexOf(" ");
  return (idx > max * 0.6 ? cut.slice(0, idx) : t.slice(0, max)).replace(/[\s,\-–—:;]+$/, "");
}

export function fitDescription(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const para = cut.lastIndexOf("\n\n");
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  const at = para > max * 0.5 ? para : sentence > max * 0.5 ? sentence + 1 : max - 1;
  return `${cut.slice(0, at).trimEnd()}…`;
}
