import sharp from "sharp";
import { maskCoverage } from "../geometry";
import { COVERAGE_MESSAGE, SegmentationFailed, type SegmentationResult } from "./types";

export const MIN_COVERAGE = 0.05;
export const MAX_COVERAGE = 0.95;

/** Extract the alpha channel of an RGBA cut-out as a single-channel PNG mask. */
export async function maskFromCutout(cutout: Buffer): Promise<Buffer> {
  return sharp(cutout).ensureAlpha().extractChannel("alpha").toColourspace("b-w").png().toBuffer();
}

/**
 * Interleave raw RGB pixels with a raw single-channel alpha into an RGBA PNG.
 * Done by hand: sharp's `joinChannel` on an encoded source can drop the alpha interpretation,
 * and the identity rule depends on the RGB bytes being copied exactly.
 */
export async function rgbaFromRgbAndAlpha(rgb: Buffer, alpha: Buffer, width: number, height: number): Promise<Buffer> {
  const n = width * height;
  if (rgb.length !== n * 3) throw new Error(`rgb buffer has ${rgb.length} bytes, expected ${n * 3}`);
  if (alpha.length !== n) throw new Error(`alpha buffer has ${alpha.length} bytes, expected ${n}`);
  const rgba = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = rgb[i * 3]!;
    rgba[i * 4 + 1] = rgb[i * 3 + 1]!;
    rgba[i * 4 + 2] = rgb[i * 3 + 2]!;
    rgba[i * 4 + 3] = alpha[i]!;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Join a mask (L) onto the source RGB to produce the cut-out PNG. Source pixels are copied, never modified. */
export async function cutoutFromMask(source: Buffer, mask: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(source).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const alpha = await sharp(mask).resize(info.width, info.height, { fit: "fill", kernel: "nearest" }).toColourspace("b-w").raw().toBuffer();
  return rgbaFromRgbAndAlpha(data, alpha, info.width, info.height);
}

/** Fraction (0..1) of the mask that is "item". */
export async function coverageOfMask(mask: Buffer): Promise<number> {
  const { data, info } = await sharp(mask).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  return maskCoverage(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height);
}

/** Reject masks that cover almost nothing or almost everything: the photo, not the model, is the problem. */
export function assertUsableCoverage(coverage: number): void {
  if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) throw new SegmentationFailed(`${COVERAGE_MESSAGE} (item covers ${Math.round(coverage * 100)}% of the frame)`);
}

/**
 * Normalise a provider's raw output into a full SegmentationResult at the source's dimensions,
 * deriving whichever of cut-out / mask the provider did not return, and validating coverage.
 */
export async function finalizeSegmentation(source: Buffer, raw: { cutout?: Buffer; mask?: Buffer }, provider: string, model?: string): Promise<SegmentationResult> {
  const meta = await sharp(source).metadata();
  const width = meta.width!, height = meta.height!;
  let mask: Buffer;
  if (raw.mask) {
    mask = await sharp(raw.mask).resize(width, height, { fit: "fill" }).toColourspace("b-w").png().toBuffer();
  } else if (raw.cutout) {
    const cm = await sharp(raw.cutout).metadata();
    const base = cm.width === width && cm.height === height ? raw.cutout : await sharp(raw.cutout).resize(width, height, { fit: "fill" }).png().toBuffer();
    mask = await maskFromCutout(base);
  } else {
    throw new SegmentationFailed("Segmentation provider returned neither a cut-out nor a mask");
  }
  const coverage = await coverageOfMask(mask);
  assertUsableCoverage(coverage);
  // Always rebuild the cut-out from OUR source + the mask so item pixels are exactly the source's,
  // even if the provider re-encoded or colour-managed its returned PNG.
  const cutout = await cutoutFromMask(source, mask);
  return { cutout, mask, coverage, provider, model };
}
