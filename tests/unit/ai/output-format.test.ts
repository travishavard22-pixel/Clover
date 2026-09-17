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
  const fact = (key: string, value: string, confidence: number) => ({ key, value, confidence, evidenceImage: 1, note: null });
  const wire = (facts: Array<ReturnType<typeof fact>> = []) =>
    ItemProfileWireSchema.parse({
      itemName: { value: "Leica M6", confidence: 0.9, evidenceImage: 1, note: null },
      facts,
      categoryPath: ["Cameras"],
      categoryConfidence: 0.8,
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
    expect(ItemProfileSchema.safeParse(hydrateProfile(wire([fact("brand", "Leica", 0.95)]))).success).toBe(true);
  });

  it("routes documented keys to their named fields", () => {
    const p = hydrateProfile(wire([fact("brand", "Leica", 0.95), fact("model", "M6", 0.8), fact("color", "Black", 0.7)]));
    expect(p.brand?.value).toBe("Leica");
    expect(p.model?.value).toBe("M6");
    expect(p.color?.value).toBe("Black");
    expect(p.attributes).toEqual([]);
  });

  it("matches a key loosely, since a model spells it however it likes", () => {
    for (const key of ["modelNumber", "Model Number", "model_number", "MODELNUMBER"]) {
      expect(hydrateProfile(wire([fact(key, "M6-2", 0.9)])).modelNumber?.value).toBe("M6-2");
    }
  });

  it("keeps an unrecognised key as an attribute under its original name", () => {
    const p = hydrateProfile(wire([fact("Lens thread", "39mm", 0.8)]));
    expect(p.attributes).toHaveLength(1);
    expect(p.attributes[0]!.name).toBe("Lens thread");
    expect(p.attributes[0]!.field.value).toBe("39mm");
    expect(p.brand).toBeNull();
  });

  it("keeps the most confident of a repeated key, whatever the order", () => {
    // A model asked for a list can report the same field twice; "last one wins" would make the
    // stored profile depend on generation order.
    const asc = hydrateProfile(wire([fact("brand", "Lieca", 0.4), fact("brand", "Leica", 0.95)]));
    const desc = hydrateProfile(wire([fact("brand", "Leica", 0.95), fact("brand", "Lieca", 0.4)]));
    expect(asc.brand?.value).toBe("Leica");
    expect(desc.brand?.value).toBe("Leica");
  });

  it("leaves unreported fields null rather than inventing them", () => {
    const p = hydrateProfile(wire());
    for (const f of [p.brand, p.model, p.modelNumber, p.color, p.material, p.size, p.dimensions, p.approximateAge]) expect(f).toBeNull();
  });

  it("derives every tier from its own confidence", () => {
    const p = hydrateProfile(wire([fact("color", "Black", 0.7), fact("Mount", "Leica M", 0.5)]));
    expect(p.itemName.tier).toBe("CONFIDENT");
    expect(p.color?.tier).toBe("LIKELY");
    expect(p.attributes[0]!.field.tier).toBe("NEEDS_CHECK");
    expect(p.condition.tier).toBe("LIKELY");
    expect(p.identityTier).toBe("CONFIDENT");
    expect(p.itemName.tier).toBe(tierFromConfidence(p.itemName.confidence));
  });

  it("never asks the model for a tier", () => {
    expect(JSON.stringify(z.toJSONSchema(ItemProfileWireSchema, { target: "draft-2020-12" }))).not.toContain("tier");
  });

  it("keeps the identify schema structurally small", () => {
    // The API rejected the previous shape outright, measured on the deployment: ten inlined copies
    // of one nullable object gave it 15 object types and 29 branches. Collapsing them into `facts`
    // brought that to 6 and 5. These bounds guard the collapse, because the repetition is easy to
    // reintroduce one convenient field at a time — and note the check is on structure, not bytes:
    // descriptions dominate the document's size and cannot affect a grammar.
    const wireJson = z.toJSONSchema(ItemProfileWireSchema, { target: "draft-2020-12", reused: "ref" }) as Record<string, unknown>;
    const defs = (wireJson.$defs ?? {}) as Record<string, unknown>;
    const inlined = (node: unknown, depth = 0): unknown => {
      if (depth > 40 || !node || typeof node !== "object") return node;
      if (Array.isArray(node)) return node.map((n) => inlined(n, depth + 1));
      const obj = node as Record<string, unknown>;
      if (typeof obj.$ref === "string") return inlined(defs[obj.$ref.replace("#/$defs/", "")], depth + 1);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) if (k !== "$defs" && k !== "description") out[k] = inlined(v, depth + 1);
      return out;
    };
    const grammar = JSON.stringify(inlined(wireJson));
    expect((grammar.match(/"type":"object"/g) ?? []).length).toBeLessThanOrEqual(7);
    expect((grammar.match(/"anyOf":/g) ?? []).length).toBeLessThanOrEqual(8);
  });
});
