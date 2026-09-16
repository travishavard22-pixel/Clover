import { z } from "zod";
import type { StudioModeId } from "./modes";
import { STUDIO_MODES } from "./modes";
import { StudioOptionsSchema, type StudioOptions } from "./options";

/**
 * Provenance for every studio output. Stored in `Photo.provenance` and embedded as XMP so the
 * file itself says how it was made.
 *
 * Next step (out of scope here): a C2PA 2.2 manifest via `c2pa-node` — `c2pa.actions` with
 * `c2pa.placed` (the cut-out) and `c2pa.edited`, signed with an X.509 cert carrying the
 * `c2pa-kp-claimSigning` EKU — so the record survives as a verifiable claim, not just metadata.
 * Marketplaces strip XMP on upload, so this record mainly serves our audit trail and EU AI Act
 * Article 50 machine-readable marking; the in-app "AI background" badge is what the seller sees.
 */

export const DIGITAL_SOURCE_TYPES = {
  composite: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
  capture: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
} as const;

export type DigitalSourceType = (typeof DIGITAL_SOURCE_TYPES)[keyof typeof DIGITAL_SOURCE_TYPES];

export type RenderPath = "composite" | "enhance" | "detail" | "condition";

export const StudioProvenanceSchema = z.object({
  pipeline: z.literal("clover-studio/1"),
  mode: z.string(),
  path: z.enum(["composite", "enhance", "detail", "condition"]),
  provider: z.object({ segmentation: z.string().nullable(), generator: z.string().nullable() }),
  /** True only when a trained model contributed pixels or the mask that decided which pixels stay. */
  aiGenerated: z.boolean(),
  model: z.string().optional(),
  sourcePhotoId: z.string(),
  options: StudioOptionsSchema,
  createdAt: z.string(),
  digitalSourceType: z.enum([DIGITAL_SOURCE_TYPES.composite, DIGITAL_SOURCE_TYPES.capture]),
  /** What happened to the item's own pixels. */
  itemPixels: z.enum(["preserved", "scaled", "resampled"]),
  /** Uniform scale applied to the cut-out (1 = none). */
  scale: z.number().optional(),
  mirrored: z.boolean(),
  colourBalanced: z.boolean(),
  background: z.object({ kind: z.string(), note: z.string().optional() }).optional(),
  /** Short badge text for the UI. */
  label: z.string(),
  /** Human-readable notes (e.g. why segmentation was skipped). */
  notes: z.array(z.string()),
  qa: z.object({ status: z.enum(["pass", "fail", "unavailable", "skipped"]), reason: z.string(), provider: z.string().optional() }).optional(),
  outputs: z.object({ pngKey: z.string().optional(), maskKey: z.string().optional(), xmp: z.boolean() }).optional(),
  description: z.string(),
  originalKey: z.string().optional(),
});

export type StudioProvenance = z.infer<typeof StudioProvenanceSchema>;

export type BuildProvenanceInput = {
  mode: StudioModeId;
  path: RenderPath;
  sourcePhotoId: string;
  options: StudioOptions;
  segmentationProvider: string | null;
  generatorProvider: string | null;
  model?: string;
  scale?: number;
  mirrored: boolean;
  colourBalanced: boolean;
  background?: { kind: string; note?: string };
  notes?: string[];
  qa?: StudioProvenance["qa"];
  outputs?: StudioProvenance["outputs"];
  createdAt?: Date;
};

/**
 * Badge text per render path. Every composite is labelled "AI background": a trained model decided
 * which pixels stayed (the mask) and the background is not the one the camera saw, even when it was
 * rendered locally. The XMP description says whether a generative model was involved.
 */
export const LABEL_BY_PATH: Record<RenderPath, string> = {
  composite: "AI background",
  enhance: "Enhancement only",
  detail: "Detail crop",
  condition: "Condition",
};

export function buildProvenance(input: BuildProvenanceInput): StudioProvenance {
  const aiGenerated = input.path === "composite" && (input.segmentationProvider !== null || input.generatorProvider !== null);
  const itemPixels: StudioProvenance["itemPixels"] = input.path === "detail" ? "resampled" : input.path === "composite" && input.scale !== undefined && Math.abs(input.scale - 1) > 1e-6 ? "scaled" : "preserved";
  const label = LABEL_BY_PATH[input.path];
  const description = describeForXmp(input.path, input.generatorProvider, input.colourBalanced);
  return {
    pipeline: "clover-studio/1",
    mode: input.mode,
    path: input.path,
    provider: { segmentation: input.segmentationProvider, generator: input.generatorProvider },
    aiGenerated,
    model: input.model,
    sourcePhotoId: input.sourcePhotoId,
    options: input.options,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    digitalSourceType: aiGenerated ? DIGITAL_SOURCE_TYPES.composite : DIGITAL_SOURCE_TYPES.capture,
    itemPixels,
    scale: input.scale,
    mirrored: input.mirrored,
    colourBalanced: input.colourBalanced,
    background: input.background,
    label,
    notes: input.notes ?? [],
    qa: input.qa,
    outputs: input.outputs,
    description,
  };
}

function describeForXmp(path: RenderPath, generator: string | null, colourBalanced: boolean): string {
  const cb = colourBalanced ? " Global colour balance adjusted at the seller's request." : "";
  switch (path) {
    case "composite":
      return `Background replaced by Clover Studio; item pixels unaltered.${generator ? " Background generated by a trained model." : " Background rendered locally (no generative model)."}${cb}`;
    case "enhance":
      return `Enhanced by Clover Studio (levels, white balance, framing); no pixels synthesised.${cb}`;
    case "detail":
      return `Detail crop by Clover Studio (2× magnification, light sharpening); nothing added or removed.${cb}`;
    case "condition":
      return `Condition photo by Clover Studio: cropped and annotated with a ring; background and defects preserved.${cb}`;
  }
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** XMP packet carrying IPTC DigitalSourceType, a Dublin Core description and the Clover pipeline id. */
export function xmpPacket(p: StudioProvenance): string {
  const providers = [p.provider.segmentation && `segmentation=${p.provider.segmentation}`, p.provider.generator && `generator=${p.provider.generator}`, p.model && `model=${p.model}`].filter(Boolean).join("; ");
  return (
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Clover Studio 1">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:clover="https://clover.app/ns/studio/1/">` +
    `<Iptc4xmpExt:DigitalSourceType>${p.digitalSourceType}</Iptc4xmpExt:DigitalSourceType>` +
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(p.description)}</rdf:li></rdf:Alt></dc:description>` +
    `<xmp:CreatorTool>Clover Studio 1</xmp:CreatorTool>` +
    `<xmp:CreateDate>${p.createdAt}</xmp:CreateDate>` +
    `<clover:pipeline>${p.pipeline}</clover:pipeline>` +
    `<clover:mode>${escapeXml(p.mode)}</clover:mode>` +
    `<clover:aiGenerated>${p.aiGenerated ? "true" : "false"}</clover:aiGenerated>` +
    `<clover:itemPixels>${p.itemPixels}</clover:itemPixels>` +
    (providers ? `<clover:providers>${escapeXml(providers)}</clover:providers>` : "") +
    `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  );
}

/** Client-safe summary for lists and badges. */
export type ProvenanceSummary = {
  label: string;
  aiGenerated: boolean;
  path: RenderPath;
  modeName: string;
  itemPixels: StudioProvenance["itemPixels"];
  providers: { segmentation: string | null; generator: string | null };
  notes: string[];
  qa: StudioProvenance["qa"] | null;
  createdAt: string;
  colourBalanced: boolean;
  mirrored: boolean;
  backgroundNote: string | null;
  hasPng: boolean;
};

/** Parse whatever is in `Photo.provenance`; returns null for non-studio photos or old records. */
export function parseProvenance(json: unknown): StudioProvenance | null {
  const r = StudioProvenanceSchema.safeParse(json);
  return r.success ? r.data : null;
}

export function summarizeProvenance(p: StudioProvenance): ProvenanceSummary {
  const spec = STUDIO_MODES[p.mode as StudioModeId];
  return {
    label: p.label,
    aiGenerated: p.aiGenerated,
    path: p.path,
    modeName: spec?.name ?? p.mode,
    itemPixels: p.itemPixels,
    providers: p.provider,
    notes: p.notes,
    qa: p.qa ?? null,
    createdAt: p.createdAt,
    colourBalanced: p.colourBalanced,
    mirrored: p.mirrored,
    backgroundNote: p.background?.note ?? null,
    hasPng: !!p.outputs?.pngKey,
  };
}
