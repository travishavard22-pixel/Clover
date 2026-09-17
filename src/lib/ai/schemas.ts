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
 * What the model is actually asked for, and it is deliberately not the shape we store.
 *
 * The API refused to compile this schema's grammar outright ("The compiled grammar is too large"),
 * measured on the deployment: identify failed at 5319 bytes while the app's other four schemas
 * passed, the largest at 671. Two things were making it expensive, and only the second mattered.
 *
 * The cheap one: every `tier` is a pure function of its own confidence, and the app recomputed all
 * twelve on arrival, overwriting whatever came back before anything read it. Dropping them stops
 * spending output tokens on a discarded value, but it barely moves the grammar.
 *
 * The expensive one: nine optional evidenced fields plus a free-form attribute list meant ten
 * inlined copies of the same small object, nine of them wrapped in "object or null". A grammar
 * compiler expands those per JSON path, so the cost was ten-fold. Collapsing them into one array
 * of facts takes the grammar from 15 object types and 29 branches to 6 and none — roughly half the
 * grammar-relevant size — while keeping identification a single call. Splitting it in two would
 * have worked too, but the photos would travel twice and images dominate this request's input
 * tokens, so it would have doubled the expensive part to dodge a schema limit.
 *
 * `ItemProfileSchema` stays the stored shape, so the database, the UI and the seller's own edits
 * are untouched. `hydrateProfile` is the single seam: it routes facts back to their named fields,
 * keeps unrecognised keys as attributes, and derives the tiers.
 */
export const EvidencedFieldWireSchema = EvidencedFieldSchema.omit({ tier: true });

/** The named fields a fact can fill. Anything else the model reports becomes an attribute. */
export const FACT_KEYS = ["brand", "model", "modelNumber", "color", "material", "size", "dimensions", "approximateAge"] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export const ItemFactSchema = z.object({
  key: z
    .string()
    .describe(
      'Either one of "brand", "model", "modelNumber" (SKU/part number), "color", "material", "size" (clothing/shoe size or capacity), "dimensions" (only if measurable against a visible reference), "approximateAge" (era or year range) — or a free-form specific such as "Mount" or "Lens thread". Omit a fact entirely rather than guessing it.',
    ),
  value: z.string(),
  confidence: z.number().describe("0-1 self-assessed probability that the value is correct"),
  evidenceImage: z.number().nullable().describe("1-based index of the photo this was read from, or null if inferred"),
  note: z.string().nullable().describe("Short justification, e.g. 'Label on underside reads M6'"),
});
export type ItemFact = z.infer<typeof ItemFactSchema>;

export const ItemProfileWireSchema = ItemProfileSchema.omit({
  identityTier: true,
  brand: true,
  model: true,
  modelNumber: true,
  color: true,
  material: true,
  size: true,
  dimensions: true,
  approximateAge: true,
  attributes: true,
}).extend({
  itemName: EvidencedFieldWireSchema.describe("Concise product name, e.g. 'Leica M6 35mm rangefinder camera'"),
  facts: z.array(ItemFactSchema).describe("Everything else read from the photos, one entry per fact. Report a fact once; omit what is not legible."),
  condition: ItemProfileSchema.shape.condition.omit({ tier: true }),
});
export type ItemProfileWire = z.infer<typeof ItemProfileWireSchema>;

/**
 * The words a model reaches for instead of our key names. A miss is not an error — the fact lands
 * in `attributes` and stays visible to the seller — but it lands in the wrong place, so `brand`
 * reads empty while "Manufacturer" shows up among the specifics. These are the natural synonyms
 * for a resale listing, which is exactly the vocabulary the request puts the model in.
 *
 * Deliberately not here: `serialNumber`, which is a different thing from a model number and
 * belongs in the attributes it would otherwise displace.
 */
const FACT_KEY_ALIASES: Record<string, FactKey> = {
  brandname: "brand",
  manufacturer: "brand",
  make: "brand",
  modelname: "model",
  productmodel: "model",
  sku: "modelNumber",
  partnumber: "modelNumber",
  mpn: "modelNumber",
  colour: "color",
  colours: "color",
  colors: "color",
  materials: "material",
  measurements: "dimensions",
  dimension: "dimensions",
  age: "approximateAge",
  era: "approximateAge",
  year: "approximateAge",
  yearrange: "approximateAge",
};

/** `"Model Number"`, `"model_number"` and `"modelNumber"` are the same field to a model, so compare loosely. */
function normaliseFactKey(key: string): FactKey | null {
  const flat = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return FACT_KEYS.find((k) => k.toLowerCase() === flat) ?? FACT_KEY_ALIASES[flat] ?? null;
}

/**
 * Turns the wire shape back into the stored profile: facts to their named fields, the rest to
 * attributes, tiers derived from confidence.
 *
 * A model asked for a list can report the same field twice. Highest confidence wins, so the result
 * is the same whatever order they arrived in — a silent "last one wins" would make the stored
 * profile depend on generation order.
 */
export function hydrateProfile(w: ItemProfileWire): ItemProfile {
  const withTier = (f: Omit<EvidencedField, "tier">): EvidencedField => ({ ...f, tier: tierFromConfidence(f.confidence) });
  const named: Partial<Record<FactKey, EvidencedField>> = {};
  const attributes: ItemProfile["attributes"] = [];

  for (const fact of w.facts) {
    const field = withTier({ value: fact.value, confidence: fact.confidence, evidenceImage: fact.evidenceImage, note: fact.note });
    const key = normaliseFactKey(fact.key);
    if (!key) {
      attributes.push({ name: fact.key, field });
      continue;
    }
    const existing = named[key];
    if (!existing || field.confidence > existing.confidence) named[key] = field;
  }

  return {
    ...w,
    itemName: withTier(w.itemName),
    brand: named.brand ?? null,
    model: named.model ?? null,
    modelNumber: named.modelNumber ?? null,
    color: named.color ?? null,
    material: named.material ?? null,
    size: named.size ?? null,
    dimensions: named.dimensions ?? null,
    approximateAge: named.approximateAge ?? null,
    attributes,
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
