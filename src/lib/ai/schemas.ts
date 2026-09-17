import { z } from "zod";

/**
 * Typed AI artifacts. These schemas are used both as Claude structured-output formats and as the
 * shape persisted in the database (ItemProfile.data, ListingDraft fields). Keep them free of
 * JSON-schema features Claude's constrained decoding rejects (min/max, minLength, recursion).
 */

export const ConfidenceTierSchema = z.enum(["CONFIDENT", "LIKELY", "NEEDS_CHECK"]);
export type ConfidenceTierValue = z.infer<typeof ConfidenceTierSchema>;

export const ConditionGradeSchema = z.enum(["NEW_SEALED", "NEW_OPEN_BOX", "LIKE_NEW", "VERY_GOOD", "GOOD", "FAIR", "FOR_PARTS"]);
export type ConditionGradeValue = z.infer<typeof ConditionGradeSchema>;

/** A single identified fact with its provenance. `evidenceImage` is the 1-based photo index it was read from. */
export const EvidencedFieldSchema = z.object({
  value: z.string(),
  confidence: z.number().describe("0-1 self-assessed probability that the value is correct"),
  tier: ConfidenceTierSchema,
  evidenceImage: z.number().nullable().describe("1-based index of the photo this was read from, or null if inferred"),
  note: z.string().nullable().describe("Short justification, e.g. 'Label on underside reads M6'"),
});
export type EvidencedField = z.infer<typeof EvidencedFieldSchema>;

export const DefectSchema = z.object({
  type: z.enum(["scratch", "scuff", "dent", "crack", "stain", "tear", "discoloration", "wear", "missing_part", "damage", "functional_unknown", "other"]),
  location: z.string(),
  severity: z.enum(["minor", "moderate", "major"]),
  description: z.string(),
  evidenceImage: z.number().nullable(),
});
export type Defect = z.infer<typeof DefectSchema>;

export const ItemProfileSchema = z.object({
  itemName: EvidencedFieldSchema.describe("Concise product name, e.g. 'Leica M6 35mm rangefinder camera'"),
  brand: EvidencedFieldSchema.nullable(),
  model: EvidencedFieldSchema.nullable(),
  modelNumber: EvidencedFieldSchema.nullable().describe("SKU / model number / part number if legible"),
  categoryPath: z.array(z.string()).describe("Broad to specific, e.g. ['Cameras & Photo','Film Photography','Film Cameras']"),
  categoryConfidence: z.number(),
  color: EvidencedFieldSchema.nullable(),
  material: EvidencedFieldSchema.nullable(),
  size: EvidencedFieldSchema.nullable().describe("Clothing/shoe size or capacity when applicable"),
  dimensions: EvidencedFieldSchema.nullable().describe("Only if measurable from a visible reference; otherwise null"),
  approximateAge: EvidencedFieldSchema.nullable().describe("Era or year range, e.g. '1984-1998' or 'circa 2019'"),
  attributes: z.array(z.object({ name: z.string(), field: EvidencedFieldSchema })).describe("Other marketplace-relevant specifics actually visible or legible"),
  accessoriesIncluded: z.array(z.string()).describe("Items visible in the photos beyond the main item (box, cables, straps…)"),
  possiblyMissing: z.array(z.string()).describe("Standard components that are NOT visible; phrase as 'not shown', never as 'missing'"),
  condition: z.object({
    grade: ConditionGradeSchema,
    confidence: z.number(),
    tier: ConfidenceTierSchema,
    summary: z.string().describe("Two honest sentences a buyer would want to read"),
    defects: z.array(DefectSchema),
    functionalStatus: z.enum(["tested_working", "powers_on", "untested", "not_working", "not_applicable"]),
  }),
  identityConfidence: z.number().describe("Overall 0-1 confidence that itemName+brand+model are right"),
  identityTier: ConfidenceTierSchema,
  alternativeIdentifications: z.array(z.object({ itemName: z.string(), brand: z.string().nullable(), model: z.string().nullable(), likelihood: z.number() })).describe("Competing candidates when uncertain, so the seller can pick"),
  unknowns: z.array(z.string()).describe("Facts a buyer would want that could not be read from the photos"),
  needsMorePhotos: z.array(z.enum(["label_closeup", "serial_number", "underside", "ports", "size_tag", "inside", "back", "defect_closeup", "accessories", "power_on_screen"])),
  searchKeywords: z.array(z.string()).describe("5-10 terms for finding comparable listings"),
  barcodeVisible: z.string().nullable().describe("Digits if a UPC/EAN barcode is legible, else null"),
  notes: z.string().nullable(),
});
export type ItemProfile = z.infer<typeof ItemProfileSchema>;

/**
 * What the model is actually asked for: the profile minus every `tier`.
 *
 * A tier is a pure function of its own confidence (`tierFromConfidence`), and the app already
 * recomputed all twelve of them on arrival — the model's answer was overwritten before anything
 * read it. Asking for a derived value cost output tokens on every call and invited the model to
 * hand back a tier that disagreed with its own confidence. Deriving it removes both.
 *
 * This does not measurably shrink the compiled grammar (it drops ten string properties; the object
 * and branch counts are unchanged), so it is not on its own a fix for the API's "compiled grammar
 * is too large" rejection. It is worth doing because the request was asking for something it threw
 * away.
 *
 * `ItemProfileSchema` stays the stored shape, so the database, the UI and the seller's own edits
 * are untouched — `hydrateProfile` is the one seam between the two.
 */
export const EvidencedFieldWireSchema = EvidencedFieldSchema.omit({ tier: true });
export const ItemProfileWireSchema = ItemProfileSchema.omit({ identityTier: true }).extend({
  itemName: EvidencedFieldWireSchema.describe("Concise product name, e.g. 'Leica M6 35mm rangefinder camera'"),
  brand: EvidencedFieldWireSchema.nullable(),
  model: EvidencedFieldWireSchema.nullable(),
  modelNumber: EvidencedFieldWireSchema.nullable().describe("SKU / model number / part number if legible"),
  color: EvidencedFieldWireSchema.nullable(),
  material: EvidencedFieldWireSchema.nullable(),
  size: EvidencedFieldWireSchema.nullable().describe("Clothing/shoe size or capacity when applicable"),
  dimensions: EvidencedFieldWireSchema.nullable().describe("Only if measurable from a visible reference; otherwise null"),
  approximateAge: EvidencedFieldWireSchema.nullable().describe("Era or year range, e.g. '1984-1998' or 'circa 2019'"),
  attributes: z.array(z.object({ name: z.string(), field: EvidencedFieldWireSchema })).describe("Other marketplace-relevant specifics actually visible or legible"),
  condition: ItemProfileSchema.shape.condition.omit({ tier: true }),
});
export type ItemProfileWire = z.infer<typeof ItemProfileWireSchema>;

/** Adds the derived tiers the wire schema leaves out. The inverse of what `omit` took away. */
export function hydrateProfile(w: ItemProfileWire): ItemProfile {
  const tier = <T extends { confidence: number } | null>(f: T): T extends null ? null : T & { tier: ConfidenceTierValue } =>
    (f ? { ...f, tier: tierFromConfidence(f.confidence) } : f) as never;
  return {
    ...w,
    itemName: tier(w.itemName),
    brand: tier(w.brand),
    model: tier(w.model),
    modelNumber: tier(w.modelNumber),
    color: tier(w.color),
    material: tier(w.material),
    size: tier(w.size),
    dimensions: tier(w.dimensions),
    approximateAge: tier(w.approximateAge),
    attributes: w.attributes.map((a) => ({ ...a, field: tier(a.field) })),
    condition: { ...w.condition, tier: tierFromConfidence(w.condition.confidence) },
    identityTier: tierFromConfidence(w.identityConfidence),
  };
}

export const ListingCopySchema = z.object({
  title: z.string(),
  description: z.string().describe("Plain text with short paragraphs; no HTML"),
  bullets: z.array(z.string()),
  conditionText: z.string(),
  specifics: z.array(z.object({ name: z.string(), value: z.string() })),
  keywords: z.array(z.string()),
  suggestedCategoryPath: z.array(z.string()),
});
export type ListingCopy = z.infer<typeof ListingCopySchema>;

/** The same shape with size limits, for copy posted by the browser. Kept apart because structured outputs reject length constraints. */
export const ListingCopyInputSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(20_000),
  bullets: z.array(z.string().max(400)).max(40),
  conditionText: z.string().max(4_000),
  specifics: z.array(z.object({ name: z.string().max(120), value: z.string().max(400) })).max(80),
  keywords: z.array(z.string().max(80)).max(80),
  suggestedCategoryPath: z.array(z.string().max(120)).max(12),
});

export const SelfCheckSchema = z.object({
  claims: z.array(z.object({ claim: z.string(), supported: z.boolean(), source: z.string().nullable() })),
  unsupportedCount: z.number(),
  verdict: z.enum(["pass", "revise", "reject"]),
});
export type SelfCheck = z.infer<typeof SelfCheckSchema>;

export const StudioQaSchema = z.object({
  sameItem: z.boolean(),
  defectsStillVisible: z.boolean(),
  nothingAddedOrRemoved: z.boolean(),
  verdict: z.enum(["pass", "fail"]),
  reason: z.string(),
});
export type StudioQa = z.infer<typeof StudioQaSchema>;

export const OfferAdviceSchema = z.object({
  recommendation: z.enum(["accept", "counter", "decline"]),
  counterAmountCents: z.number().nullable(),
  reasoning: z.string(),
  suggestedMessage: z.string(),
});
export type OfferAdvice = z.infer<typeof OfferAdviceSchema>;

export type ListingTone = "neutral" | "persuasive" | "casual" | "professional" | "seo" | "condition_focus";
export type ListingLength = "shorter" | "standard" | "longer";

export function tierFromConfidence(c: number): ConfidenceTierValue {
  if (c >= 0.85) return "CONFIDENT";
  if (c >= 0.6) return "LIKELY";
  return "NEEDS_CHECK";
}

/** Build the closed-world "verified attributes" the listing generator is allowed to use. */
export function verifiedAttributesFromProfile(p: ItemProfile, minConfidence = 0.6) {
  const out: Array<{ name: string; value: string; confidence: number }> = [];
  const push = (name: string, f: EvidencedField | null) => {
    if (f && f.value && f.confidence >= minConfidence) out.push({ name, value: f.value, confidence: f.confidence });
  };
  push("Item", p.itemName);
  push("Brand", p.brand);
  push("Model", p.model);
  push("Model number", p.modelNumber);
  push("Color", p.color);
  push("Material", p.material);
  push("Size", p.size);
  push("Dimensions", p.dimensions);
  push("Age", p.approximateAge);
  for (const a of p.attributes) push(a.name, a.field);
  return out;
}
