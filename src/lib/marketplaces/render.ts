import type { ConditionGrade, Marketplace } from "../db";
import { CONDITION_LABELS, MARKETPLACES, fitDescription, fitTitle } from "./registry";
import { nextdoorCategoryFor } from "./nextdoor/categories";

/** The subset of Item / ListingDraft / UserPreferences the renderer needs. Kept structural so it is pure and testable. */
export type RenderItem = {
  title: string;
  brand: string | null;
  model: string | null;
  categoryPath: string[];
  conditionGrade: ConditionGrade | null;
  conditionNotes: string | null;
  listPrice: number | null;
  shippingCost: number | null;
};

export type RenderDraft = {
  marketplace: Marketplace | null;
  title: string;
  description: string;
  bullets: string[];
  conditionText: string;
  specifics: Array<{ name: string; value: string }>;
  categoryPath: string[];
  categoryId: string | null;
  price: number | null;
};

export type RenderPrefs = {
  city: string | null;
  region: string | null;
  offersLocalPickup: boolean;
  offersShipping: boolean;
  defaultShippingNote: string | null;
};

export type RenderedListing = {
  title: string;
  titleMax: number;
  description: string;
  descriptionMax: number;
  priceCents: number | null;
  conditionLabel: string;
  categoryHint: string | null;
  categoryPath: string[];
  specifics: Array<{ name: string; value: string }>;
  shippingLine: string;
  draftSource: "marketplace" | "generic";
  warnings: string[];
};

export function conditionLabelFor(marketplace: Marketplace, grade: ConditionGrade | null): string {
  if (!grade) return "Condition not set";
  const c = CONDITION_LABELS[grade];
  switch (marketplace) {
    case "EBAY":
      return c.ebayName;
    case "FACEBOOK":
      return c.facebook;
    case "OFFERUP":
      return c.offerup;
    case "MERCARI":
      return c.mercari;
    case "POSHMARK":
      return c.poshmark;
    default:
      return c.generic;
  }
}

/** Strip things Facebook/OfferUp moderation dislikes: external links and cross-listing mentions. */
export function sanitizeForMarketplace(marketplace: Marketplace, text: string): string {
  let t = text;
  if (marketplace === "FACEBOOK" || marketplace === "OFFERUP" || marketplace === "NEXTDOOR" || marketplace === "CRAIGSLIST") {
    t = t.replace(/https?:\/\/\S+/gi, "").replace(/\bwww\.\S+/gi, "");
    t = t.replace(/^.*\b(also (listed|available|posted) on|cross-?listed|listed on ebay)\b.*$/gim, "");
  }
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function shippingLineFor(marketplace: Marketplace, prefs: RenderPrefs): string {
  const info = MARKETPLACES[marketplace];
  const where = [prefs.city, prefs.region].filter(Boolean).join(", ");
  const pickup = info.supportsLocal && prefs.offersLocalPickup ? (where ? `Local pickup in ${where}` : "Local pickup available") : null;
  const ship = info.supportsShipping && prefs.offersShipping ? "Shipping available" : null;
  const parts = [pickup, ship].filter(Boolean);
  if (parts.length === 0) return info.supportsLocal ? "Local pickup" : "Shipping";
  const note = prefs.defaultShippingNote?.trim();
  return note ? `${parts.join(" · ")}. ${note}` : parts.join(" · ");
}

export function categoryHintFor(marketplace: Marketplace, path: string[]): string | null {
  if (marketplace === "NEXTDOOR") {
    const cat = nextdoorCategoryFor(path);
    return cat ? cat.label : null;
  }
  if (!path.length) return null;
  return path.join(" › ");
}

/**
 * Render the listing a marketplace will receive. Uses the per-marketplace draft when one exists,
 * otherwise derives from the generic draft under the marketplace's own limits.
 */
export function renderListing(marketplace: Marketplace, input: { item: RenderItem; drafts: RenderDraft[]; prefs: RenderPrefs }): RenderedListing {
  const info = MARKETPLACES[marketplace];
  const specific = input.drafts.find((d) => d.marketplace === marketplace) ?? null;
  const generic = input.drafts.find((d) => d.marketplace === null) ?? null;
  const draft = specific ?? generic;
  const warnings: string[] = [];

  const rawTitle = (draft?.title || input.item.title || "").trim();
  const title = fitTitle(rawTitle, info.limits.titleMax);
  if (rawTitle.length > info.limits.titleMax) warnings.push(`Title shortened to ${info.limits.titleMax} characters for ${info.shortName}.`);

  const conditionLabel = conditionLabelFor(marketplace, input.item.conditionGrade);
  const shippingLine = shippingLineFor(marketplace, input.prefs);

  const body: string[] = [];
  if (draft?.description) body.push(sanitizeForMarketplace(marketplace, draft.description));
  if (draft?.bullets?.length && marketplace !== "EBAY") body.push(draft.bullets.map((b) => `• ${b}`).join("\n"));
  const conditionText = draft?.conditionText?.trim() || input.item.conditionNotes?.trim() || "";
  if (input.item.conditionGrade || conditionText) body.push(`Condition: ${conditionLabel}${conditionText ? `. ${conditionText}` : ""}`);
  body.push(shippingLine);
  const fullDescription = body.filter(Boolean).join("\n\n");
  const description = fitDescription(fullDescription, info.limits.descriptionMax);
  if (fullDescription.length > info.limits.descriptionMax) warnings.push(`Description trimmed to ${info.limits.descriptionMax} characters for ${info.shortName}.`);

  const priceCents = draft?.price ?? input.item.listPrice ?? null;
  const categoryPath = draft?.categoryPath?.length ? draft.categoryPath : input.item.categoryPath;
  const categoryHint = categoryHintFor(marketplace, categoryPath);

  const specifics = mergeSpecifics(draft?.specifics ?? [], [
    ...(input.item.brand ? [{ name: "Brand", value: input.item.brand }] : []),
    ...(input.item.model ? [{ name: "Model", value: input.item.model }] : []),
  ]);

  return {
    title,
    titleMax: info.limits.titleMax,
    description,
    descriptionMax: info.limits.descriptionMax,
    priceCents,
    conditionLabel,
    categoryHint,
    categoryPath,
    specifics,
    shippingLine,
    draftSource: specific ? "marketplace" : "generic",
    warnings,
  };
}

/** Case-insensitive merge by name; the first source wins. */
export function mergeSpecifics(primary: Array<{ name: string; value: string }>, fallback: Array<{ name: string; value: string }>) {
  const out: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();
  for (const s of [...primary, ...fallback]) {
    const key = s.name.trim().toLowerCase();
    if (!key || !s.value?.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: s.name.trim(), value: s.value.trim() });
  }
  return out;
}

export function findSpecific(specifics: Array<{ name: string; value: string }>, name: string): string | null {
  const key = name.trim().toLowerCase();
  return specifics.find((s) => s.name.trim().toLowerCase() === key)?.value ?? null;
}

/** Parse `ListingDraft.specifics` JSON defensively. */
export function parseSpecifics(json: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(json)) return [];
  return json
    .filter((s): s is { name: unknown; value: unknown } => !!s && typeof s === "object" && "name" in s && "value" in s)
    .map((s) => ({ name: String(s.name ?? ""), value: String(s.value ?? "") }))
    .filter((s) => s.name && s.value);
}
