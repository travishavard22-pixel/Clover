import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { hydrateProfile, ItemProfileSchema, ItemProfileWireSchema, tierFromConfidence } from "@/lib/ai/schemas";

/** Mirrors `outputFormat` in lib/ai/anthropic.ts, which is private to the provider. */
function buildFormat(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", reused: "ref" }) as Record<string, unknown>;
  delete json.$schema;
  return jsonSchemaOutputFormat(json as never, { transform: false }) as { schema: Record<string, unknown> };
}

describe("structured output format", () => {
  it("keeps enums as enums", () => {
    // The reason this file exists: SDK 0.126's zodOutputFormat transform deletes `enum` and writes
    // the values into `description` as prose, leaving the model free to invent a value that then
    // fails the whole parse. If a future SDK fixes its transform this test still passes; if our own
    // wiring regresses to the lossy path, it fails.
    const json = JSON.stringify(buildFormat(ItemProfileWireSchema).schema);
    expect(json).toContain('"enum":');
    expect(json).not.toContain("{enum:");
    for (const grade of ["NEW_SEALED", "LIKE_NEW", "FOR_PARTS"]) expect(json).toContain(grade);
  });

  it("documents the SDK bug this works around", () => {
    // Pinned deliberately: if the SDK starts preserving enums, this fails and the workaround (and
    // its comment) can be reconsidered rather than carried forever.
    const lossy = JSON.stringify((zodOutputFormat(z.object({ g: z.enum(["A", "B"]) })) as { schema: unknown }).schema);
    expect(lossy).not.toContain('"enum":');
    expect(lossy).toContain("{enum:");
  });

  it("emits no JSON Schema keyword the API rejects", () => {
    // Constraints like minLength/maximum are not supported by constrained decoding; the schemas are
    // written to avoid them, and this checks the generated document rather than trusting that.
    const SUPPORTED = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "const", "anyOf", "allOf", "$ref", "$defs", "definitions", "default", "description", "format", "minItems", "title", "prefixItems"]);
    const offenders: string[] = [];
    const audit = (node: unknown, path: string) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (!SUPPORTED.has(key)) {
          offenders.push(`${path}.${key}`);
          continue;
        }
        if (key === "properties" || key === "$defs" || key === "definitions") {
          for (const [name, child] of Object.entries((value ?? {}) as Record<string, unknown>)) audit(child, `${path}.${key}.${name}`);
        } else if (key === "anyOf" || key === "allOf" || key === "prefixItems") {
          ((value ?? []) as unknown[]).forEach((child, i) => audit(child, `${path}.${key}[${i}]`));
        } else if (key === "items") audit(value, `${path}.items`);
      }
    };
    audit(buildFormat(ItemProfileWireSchema).schema, "");
    expect(offenders).toEqual([]);
  });
});

describe("hydrateProfile", () => {
  const field = (value: string, confidence: number) => ({ value, confidence, evidenceImage: 1, note: null });
  const wire = () =>
    ItemProfileWireSchema.parse({
      itemName: field("Leica M6", 0.9),
      brand: field("Leica", 0.95),
      model: null,
      modelNumber: null,
      categoryPath: ["Cameras"],
      categoryConfidence: 0.8,
      color: field("Black", 0.7),
      material: null,
      size: null,
      dimensions: null,
      approximateAge: null,
      attributes: [{ name: "Mount", field: field("Leica M", 0.5) }],
      accessoriesIncluded: [],
      possiblyMissing: [],
      condition: { grade: "GOOD", confidence: 0.62, summary: "Used.", defects: [], functionalStatus: "untested" },
      identityConfidence: 0.88,
      alternativeIdentifications: [],
      unknowns: [],
      needsMorePhotos: [],
      searchKeywords: ["leica"],
      barcodeVisible: null,
      notes: null,
    });

  it("produces a profile the stored schema accepts", () => {
    expect(ItemProfileSchema.safeParse(hydrateProfile(wire())).success).toBe(true);
  });

  it("derives every tier from its own confidence", () => {
    const p = hydrateProfile(wire());
    expect(p.itemName.tier).toBe("CONFIDENT");
    expect(p.brand?.tier).toBe("CONFIDENT");
    expect(p.color?.tier).toBe("LIKELY");
    expect(p.attributes[0]!.field.tier).toBe("NEEDS_CHECK");
    expect(p.condition.tier).toBe("LIKELY");
    expect(p.identityTier).toBe("CONFIDENT");
    // Every derived tier must agree with the shared rule, since disagreement was the old bug.
    expect(p.itemName.tier).toBe(tierFromConfidence(p.itemName.confidence));
    expect(p.condition.tier).toBe(tierFromConfidence(p.condition.confidence));
  });

  it("leaves absent fields absent rather than inventing a tier", () => {
    const p = hydrateProfile(wire());
    expect(p.model).toBeNull();
    expect(p.dimensions).toBeNull();
  });

  it("never asks the model for a tier", () => {
    // The wire schema is what reaches the API. A `tier` in it would be a value the app overwrites.
    expect(JSON.stringify(z.toJSONSchema(ItemProfileWireSchema, { target: "draft-2020-12" }))).not.toContain("tier");
  });
});
