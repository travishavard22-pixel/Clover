import sharp from "sharp";
import { renderBackgroundForMode, type BackgroundContext, type RenderedBackground } from "./background";
import { dominantColourMasked } from "./background/dominant";
import { compositeItem, enhanceOnly, planComposite, renderCondition, renderDetail, type CompositePlan, type RawImage } from "./compositor";
import type { Size } from "./geometry";
import type { StudioModeId } from "./modes";
import type { StudioOptions } from "./options";
import { LABEL_BY_PATH, type RenderPath } from "./provenance";
import { decideStrategy } from "./strategy";

/**
 * The render pipeline shared by the STUDIO_RENDER job handler (which runs it step by step so each
 * stage is a real, reported job step) and the synchronous preview endpoint (which runs `renderQuick`
 * at a small size). Pure sharp — no DB, no network, no env.
 */

/** Long edge of a full render. Matches the research pipeline (§3.3: downscale to 2048px). */
export const RENDER_MAX_EDGE = 2048;
/** Long edge of a live preview: small enough to render in well under a second. */
export const PREVIEW_MAX_EDGE = 640;

export type PreparedSource = { buffer: Buffer; width: number; height: number };

/**
 * Normalise a stored photo for rendering: EXIF orientation applied, alpha dropped, long edge capped.
 * Encoded as PNG so the cut-out copied from it is exactly what we decoded — no second JPEG pass.
 */
export async function prepareSource(input: Buffer, maxEdge = RENDER_MAX_EDGE): Promise<PreparedSource> {
  const out = await sharp(input, { failOn: "none" })
    .rotate()
    .removeAlpha()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 1 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height };
}

/** Resize a single-channel mask to exactly `size` (used when a cached mask meets a differently sized source). */
export async function scaleMaskTo(mask: Buffer, size: Size): Promise<Buffer> {
  const meta = await sharp(mask).metadata();
  if (meta.width === size.width && meta.height === size.height) return sharp(mask).toColourspace("b-w").png().toBuffer();
  return sharp(mask).toColourspace("b-w").resize(size.width, size.height, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
}

export type BackgroundStage = { plan: CompositePlan; background: RenderedBackground };

/** Stage 1 of a composite: decide the frame and placement, then render the background to fit it. */
export async function planAndRenderBackground(source: Buffer, mask: Buffer, mode: StudioModeId, options: StudioOptions, maxEdge = RENDER_MAX_EDGE, extra: Partial<BackgroundContext> = {}): Promise<BackgroundStage> {
  const plan = await planComposite(source, mask, options, maxEdge);
  const ctx: BackgroundContext = { source, mask, ...extra };
  if (mode === "SOCIAL" && options.background === "auto" && !ctx.itemDominant) ctx.itemDominant = await dominantColourMasked(source, mask);
  const background = await renderBackgroundForMode(mode, options, plan.frame, ctx);
  return { plan, background };
}

export type QuickRender = {
  raw: RawImage;
  path: RenderPath;
  /** Badge text, e.g. "Enhancement only". */
  label: string;
  notes: string[];
  mirrored: boolean;
  colourBalanced: boolean;
  /** Uniform scale applied to the cut-out (composite path only). */
  scale?: number;
  background?: { kind: string; note?: string };
  /** What the enhance path did, in order. */
  applied?: string[];
};

export type QuickRenderInput = {
  source: Buffer;
  mode: StudioModeId;
  options: StudioOptions;
  /** A mask at any size; scaled to the source. Without one, segmentation-based modes fall back to enhancement. */
  mask?: Buffer | null;
  maxEdge?: number;
  /** Reason to surface when no mask is available (e.g. "No segmentation provider configured"). */
  unavailableReason?: string | null;
};

/**
 * One-shot render used for previews and tests. Picks the same path the job handler would
 * (`decideStrategy`) given only what is already on hand — it never calls a segmentation provider.
 */
export async function renderQuick(input: QuickRenderInput): Promise<QuickRender> {
  const maxEdge = input.maxEdge ?? PREVIEW_MAX_EDGE;
  const prepared = await prepareSource(input.source, maxEdge);
  const strategy = decideStrategy(input.mode, { segmentationAvailable: false, hasCachedMask: !!input.mask, unavailableReason: input.unavailableReason });
  const notes: string[] = [];
  switch (strategy.path) {
    case "condition": {
      const r = await renderCondition(prepared.buffer, input.options, { maxEdge });
      return { raw: r.raw, path: "condition", label: LABEL_BY_PATH.condition, notes, mirrored: r.mirrored, colourBalanced: r.colourBalanced };
    }
    case "detail": {
      const r = await renderDetail(prepared.buffer, input.options, { maxEdge });
      return { raw: r.raw, path: "detail", label: LABEL_BY_PATH.detail, notes, mirrored: r.mirrored, colourBalanced: r.colourBalanced };
    }
    case "composite": {
      const mask = await scaleMaskTo(input.mask!, { width: prepared.width, height: prepared.height });
      const stage = await planAndRenderBackground(prepared.buffer, mask, input.mode, input.options, maxEdge);
      const out = await compositeItem(prepared.buffer, mask, stage.background, stage.plan, input.options);
      if (stage.background.note) notes.push(stage.background.note);
      return {
        raw: out.raw,
        path: "composite",
        label: LABEL_BY_PATH.composite,
        notes,
        mirrored: stage.plan.mirrored,
        colourBalanced: out.colourBalanced,
        scale: stage.plan.placement.scale,
        background: { kind: stage.background.kind, note: stage.background.note },
      };
    }
    case "enhance":
    default: {
      if (strategy.segmentReason) notes.push(strategy.segmentReason);
      const r = await enhanceOnly(prepared.buffer, input.options, { maxEdge });
      return { raw: r.raw, path: "enhance", label: LABEL_BY_PATH.enhance, notes, mirrored: r.mirrored, colourBalanced: r.colourBalanced, applied: r.applied };
    }
  }
}

/** Encode a raw RGB image as a JPEG data URL for the preview endpoint. */
export async function toJpegDataUrl(raw: RawImage, quality = 82): Promise<string> {
  const jpeg = await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } }).jpeg({ quality, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
