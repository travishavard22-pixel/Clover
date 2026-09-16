import sharp, { type OverlayOptions } from "sharp";
import type { RenderedBackground } from "./background/types";
import { centredAspectCrop, focusCrop, focusWithinBox, fitItem, frameForAspect, maskBoundingBox, type Box, type Placement, type Size } from "./geometry";
import { shadowParams, type ShadowParams } from "./lighting";
import { colourBalanceRequested, type StudioOptions } from "./options";
import { STUDIO_ACCENT_HEX, STUDIO_INK_HEX } from "./palette";
import { SegmentationFailed } from "./segmentation/types";

/**
 * The compositor. Pure sharp; no DB, no network.
 *
 * Identity rule: the cut-out is never repainted. The only operation ever applied to item pixels
 * is the single uniform scale needed to fit the frame (recorded as `placement.scale`, 1 = none),
 * plus the optional global colour balance the user explicitly asks for (recorded as
 * `colourBalanced`). Everything else — background, shadow, framing — happens around the item.
 */

export const DEFAULT_MAX_EDGE = 2048;
export const JPEG_QUALITY = 92;

export type RawImage = { data: Buffer; width: number; height: number; channels: 3 };

export type CompositePlan = {
  source: Size;
  frame: Size;
  itemBox: Box;
  placement: Placement;
  mirrored: boolean;
  shadow: ShadowParams | null;
};

async function flopIf(buffer: Buffer, flip: boolean): Promise<Buffer> {
  return flip ? sharp(buffer).flop().png().toBuffer() : buffer;
}

async function rawMask(mask: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(mask).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Decide frame, item bounding box and placement. Throws when the mask has no item pixels. */
export async function planComposite(source: Buffer, mask: Buffer, options: StudioOptions, maxEdge = DEFAULT_MAX_EDGE): Promise<CompositePlan> {
  const meta = await sharp(source).metadata();
  const srcW = meta.width!, srcH = meta.height!;
  const m = await rawMask(mask);
  if (m.width !== srcW || m.height !== srcH) throw new SegmentationFailed("Mask and photo sizes differ");
  let itemBox = maskBoundingBox(new Uint8Array(m.data.buffer, m.data.byteOffset, m.data.length), m.width, m.height);
  if (!itemBox) throw new SegmentationFailed("Couldn't separate the item from the background — the mask is empty");
  if (options.flipHorizontal) itemBox = { ...itemBox, left: srcW - itemBox.left - itemBox.width };
  const frame = frameForAspect(srcW, srcH, options.crop.aspect, maxEdge);
  // Items sit slightly below centre so the contact shadow has room; matches product photography convention.
  const placement = fitItem(itemBox, frame, options.crop.padding, { maxUpscale: 1.5, verticalBias: options.shadow.type === "none" ? 0 : 0.08 });
  return { source: { width: srcW, height: srcH }, frame, itemBox, placement, mirrored: options.flipHorizontal, shadow: shadowParams(options) };
}

/** Build the shadow as an RGBA layer covering the whole frame (black + blurred silhouette alpha). */
async function shadowLayer(maskRegion: Buffer, plan: CompositePlan): Promise<Buffer | null> {
  const p = plan.shadow;
  if (!p) return null;
  const { frame, placement } = plan;
  const sw = Math.max(1, placement.width);
  const sh = Math.max(1, Math.round(placement.height * p.squash));
  const sil = await sharp(maskRegion).resize(sw, sh, { fit: "fill", kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer();
  // Anchor the silhouette at the item's bottom edge, then offset.
  const left = Math.round(placement.left + p.dx * placement.width);
  const top = Math.round(placement.top + (placement.height - sh) + p.dy * placement.height);
  const alpha = Buffer.alloc(frame.width * frame.height, 0);
  for (let y = 0; y < sh; y++) {
    const fy = top + y;
    if (fy < 0 || fy >= frame.height) continue;
    for (let x = 0; x < sw; x++) {
      const fx = left + x;
      if (fx < 0 || fx >= frame.width) continue;
      alpha[fy * frame.width + fx] = sil[y * sw + x]!;
    }
  }
  const sigma = Math.max(0.3, p.sigma * (Math.max(frame.width, frame.height) / 1024));
  const blurred = await sharp(alpha, { raw: { width: frame.width, height: frame.height, channels: 1 } })
    .blur(sigma)
    .linear(p.opacity, 0)
    .raw()
    .toBuffer();
  const rgba = Buffer.alloc(frame.width * frame.height * 4, 0);
  for (let i = 0, n = frame.width * frame.height; i < n; i++) rgba[i * 4 + 3] = blurred[i]!;
  return sharp(rgba, { raw: { width: frame.width, height: frame.height, channels: 4 } }).png().toBuffer();
}

export type CompositeResult = {
  raw: RawImage;
  plan: CompositePlan;
  background: RenderedBackground;
  colourBalanced: boolean;
};

/**
 * Place the cut-out and its shadow on a pre-rendered background of exactly `plan.frame` size.
 * `source` and `mask` are the same buffers given to `planComposite`.
 */
export async function compositeItem(source: Buffer, mask: Buffer, background: RenderedBackground, plan: CompositePlan, options: StudioOptions): Promise<CompositeResult> {
  if (background.size.width !== plan.frame.width || background.size.height !== plan.frame.height) throw new Error("Background size does not match the planned frame");
  const src = await flopIf(source, plan.mirrored);
  const msk = await flopIf(mask, plan.mirrored);
  const { itemBox, placement } = plan;

  // Cut-out region = source pixels (untouched) + mask alpha, then the single uniform scale.
  const maskRegion = await sharp(msk).extract(itemBox).toColourspace("b-w").png().toBuffer();
  const alpha = await sharp(maskRegion).raw().toBuffer();
  let item = sharp(src).removeAlpha().extract(itemBox).joinChannel(alpha, { raw: { width: itemBox.width, height: itemBox.height, channels: 1 } });
  if (placement.width !== itemBox.width || placement.height !== itemBox.height) item = item.resize(placement.width, placement.height, { fit: "fill", kernel: "lanczos3" });
  const itemPng = await item.png().toBuffer();

  const layers: OverlayOptions[] = [];
  const shadow = await shadowLayer(maskRegion, plan);
  if (shadow) layers.push({ input: shadow, left: 0, top: 0 });
  layers.push({ input: itemPng, left: placement.left, top: placement.top });

  const composed = await sharp(background.image).removeAlpha().composite(layers).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let raw: RawImage = { data: composed.data, width: composed.info.width, height: composed.info.height, channels: 3 };
  const colourBalanced = colourBalanceRequested(options);
  if (colourBalanced) raw = await applyColourBalance(raw, options);
  return { raw, plan, background, colourBalanced };
}

/**
 * Global colour balance. Temperature shifts the red/blue gains (±12% at the extremes);
 * exposure is a linear gain of 2^stops. Applied to the whole image, item included — only when
 * the user asked for it.
 */
export async function applyColourBalance(raw: RawImage, options: StudioOptions): Promise<RawImage> {
  const t = options.colorBalance.temperature / 100;
  const m = Math.pow(2, options.colorBalance.exposure);
  const gains = [m * (1 + 0.12 * t), m, m * (1 - 0.12 * t)];
  const out = await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } })
    .linear(gains, [0, 0, 0])
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height, channels: 3 };
}

export type EncodedOutput = { jpeg: Buffer; png?: Buffer; width: number; height: number };

/** Encode once, embedding the XMP provenance packet. PNG is lossless and is produced on request. */
export async function encodeOutput(raw: RawImage, opts: { xmp?: string; png?: boolean; quality?: number } = {}): Promise<EncodedOutput> {
  const base = () => {
    let s = sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } });
    if (opts.xmp) s = s.withXmp(opts.xmp);
    return s;
  };
  const jpeg = await base().jpeg({ quality: opts.quality ?? JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
  const png = opts.png ? await base().png({ compressionLevel: 8 }).toBuffer() : undefined;
  return { jpeg, png, width: raw.width, height: raw.height };
}

/** Mean colour of the outer 1/16 border, used to extend a photo without a visible seam. */
export async function edgeColour(image: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(image).removeAlpha().resize(32, 32, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x > 1 && x < info.width - 2 && y > 1 && y < info.height - 2) continue;
      const i = (y * info.width + x) * 3;
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
      n++;
    }
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

export type EnhanceResult = { raw: RawImage; applied: string[]; colourBalanced: boolean; mirrored: boolean };

/**
 * Enhancement-only path, used when no cut-out is available. Levels, gentle grey-world white
 * balance, aspect framing (the photo is extended with its own edge colour rather than cropped, so
 * nothing is lost), optional padding, optional user colour balance. No pixels are synthesised.
 */
export async function enhanceOnly(source: Buffer, options: StudioOptions, opts: { maxEdge?: number } = {}): Promise<EnhanceResult> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const applied: string[] = [];
  const meta = await sharp(source).metadata();
  let img = sharp(source).removeAlpha().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true });
  if (options.flipHorizontal) {
    img = img.flop();
    applied.push("mirrored");
  }
  // Levels: stretch the 1st–99th percentile to full range (protects against clipped highlights).
  img = img.normalise({ lower: 1, upper: 99 });
  applied.push("levels");
  const levelled = await img.raw().toBuffer({ resolveWithObject: true });

  // Grey-world white balance with gains clamped to ±8% so colours stay true.
  const stats = await sharp(levelled.data, { raw: { width: levelled.info.width, height: levelled.info.height, channels: 3 } }).stats();
  const means = stats.channels.slice(0, 3).map((c) => c.mean);
  const grey = (means[0]! + means[1]! + means[2]!) / 3;
  const gains = means.map((m) => Math.min(1.08, Math.max(0.92, grey / Math.max(1, m))));
  let balanced = sharp(levelled.data, { raw: { width: levelled.info.width, height: levelled.info.height, channels: 3 } }).linear(gains, [0, 0, 0]);
  applied.push("white balance");

  // Framing: extend to the requested aspect with the photo's own edge colour, plus padding.
  const w = levelled.info.width, h = levelled.info.height;
  const target = frameForAspect(w, h, options.crop.aspect, Math.max(w, h));
  const pad = Math.round((Math.min(target.width, target.height) * options.crop.padding) / 100);
  const needFrame = options.crop.aspect !== "original" || pad > 0;
  if (needFrame) {
    const fill = await edgeColour(source);
    // Scale the photo to fit inside the padded target, then extend to exactly the target size.
    const innerW = Math.max(1, target.width - pad * 2), innerH = Math.max(1, target.height - pad * 2);
    const s = Math.min(innerW / w, innerH / h, 1);
    const rw = Math.max(1, Math.round(w * s)), rh = Math.max(1, Math.round(h * s));
    const rawScaled = await balanced.resize(rw, rh, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
    const left = Math.round((target.width - rw) / 2), top = Math.round((target.height - rh) / 2);
    balanced = sharp(rawScaled, { raw: { width: rw, height: rh, channels: 3 } }).extend({ left, top, right: target.width - rw - left, bottom: target.height - rh - top, background: fill });
    applied.push(options.crop.aspect === "original" ? `padded ${options.crop.padding}%` : `extended to ${options.crop.aspect} with edge colour`);
  }
  const out = await balanced.raw().toBuffer({ resolveWithObject: true });
  let raw: RawImage = { data: out.data, width: out.info.width, height: out.info.height, channels: 3 };
  const colourBalanced = colourBalanceRequested(options);
  if (colourBalanced) {
    raw = await applyColourBalance(raw, options);
    applied.push("colour balance (user)");
  }
  void meta;
  return { raw, applied, colourBalanced, mirrored: options.flipHorizontal };
}

export type FocusRenderResult = { raw: RawImage; crop: Box; colourBalanced: boolean; mirrored: boolean; ring?: { cx: number; cy: number; r: number } };

/** DETAIL: 2× crop around the focus point, lightly sharpened. Resamples pixels (documented in provenance). */
export async function renderDetail(source: Buffer, options: StudioOptions, opts: { maxEdge?: number } = {}): Promise<FocusRenderResult> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const meta = await sharp(source).metadata();
  const w = meta.width!, h = meta.height!;
  const focus = options.flipHorizontal ? { x: 1 - options.focus.x, y: options.focus.y } : options.focus;
  const crop = focusCrop(w, h, focus, 2, options.crop.aspect);
  const longEdge = Math.min(maxEdge, Math.max(crop.width, crop.height) * 2);
  const scale = longEdge / Math.max(crop.width, crop.height);
  let img = sharp(source).removeAlpha();
  if (options.flipHorizontal) img = img.flop();
  const out = await img
    .extract(crop)
    .resize(Math.round(crop.width * scale), Math.round(crop.height * scale), { fit: "fill", kernel: "lanczos3" })
    .sharpen({ sigma: 1, m1: 0.6, m2: 1.4 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let raw: RawImage = { data: out.data, width: out.info.width, height: out.info.height, channels: 3 };
  const colourBalanced = colourBalanceRequested(options);
  if (colourBalanced) raw = await applyColourBalance(raw, options);
  return { raw, crop, colourBalanced, mirrored: options.flipHorizontal };
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** SVG overlay for CONDITION: a thin accent ring with a white halo, and an optional label pill. */
export function conditionOverlaySvg(size: Size, ring: { cx: number; cy: number; r: number }, label: string, accentHex = STUDIO_ACCENT_HEX): string {
  const short = Math.min(size.width, size.height);
  const stroke = Math.max(3, Math.round(short * 0.007));
  const font = Math.max(14, Math.round(short * 0.034));
  const padX = Math.round(font * 0.7), padY = Math.round(font * 0.45);
  const text = label.trim();
  const approxTextWidth = Math.round(text.length * font * 0.56);
  const pillW = approxTextWidth + padX * 2, pillH = font + padY * 2;
  const margin = Math.round(short * 0.04);
  const pill = text
    ? `<g><rect x="${margin}" y="${size.height - margin - pillH}" width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="${STUDIO_INK_HEX}" fill-opacity="0.78"/><text x="${margin + padX}" y="${size.height - margin - padY - Math.round(font * 0.22)}" font-family="Inter, 'Inter Variable', 'DejaVu Sans', Helvetica, Arial, sans-serif" font-size="${font}" font-weight="500" fill="#FFFFFF">${escapeXml(text)}</text></g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="${stroke + 3}"/><circle cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" fill="none" stroke="${accentHex}" stroke-width="${stroke}"/>${pill}</svg>`;
}

/**
 * CONDITION: crop around the defect, draw the ring and label. Never removes the background,
 * never sharpens, never smooths; the only pixel change is a downscale if the crop exceeds `maxEdge`.
 */
export async function renderCondition(source: Buffer, options: StudioOptions, opts: { maxEdge?: number } = {}): Promise<FocusRenderResult> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const meta = await sharp(source).metadata();
  const w = meta.width!, h = meta.height!;
  const focus = options.flipHorizontal ? { x: 1 - options.focus.x, y: options.focus.y } : options.focus;
  const crop = focusCrop(w, h, focus, 1.6, options.crop.aspect);
  let img = sharp(source).removeAlpha();
  if (options.flipHorizontal) img = img.flop();
  const cropped = await img.extract(crop).resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const size = { width: cropped.info.width, height: cropped.info.height };
  const f = focusWithinBox(w, h, focus, crop);
  const ring = { cx: Math.round(f.x * size.width), cy: Math.round(f.y * size.height), r: Math.round(Math.min(size.width, size.height) * 0.16) };
  const overlay = Buffer.from(conditionOverlaySvg(size, ring, options.label));
  const out = await sharp(cropped.data, { raw: { width: size.width, height: size.height, channels: 3 } })
    .composite([{ input: overlay, left: 0, top: 0 }])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let raw: RawImage = { data: out.data, width: out.info.width, height: out.info.height, channels: 3 };
  const colourBalanced = colourBalanceRequested(options);
  if (colourBalanced) raw = await applyColourBalance(raw, options);
  return { raw, crop, colourBalanced, mirrored: options.flipHorizontal, ring };
}

/** Centred aspect crop helper re-exported for callers that need "what would be lost" previews. */
export { centredAspectCrop };
