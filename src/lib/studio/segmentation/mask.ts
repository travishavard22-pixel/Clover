import sharp from "sharp";
import { maskCoverage } from "../geometry";
import { COVERAGE_MESSAGE, SegmentationFailed, type SegmentationResult } from "./types";

export const MIN_COVERAGE = 0.05;
export const MAX_COVERAGE = 0.95;

/** Extract the alpha channel of an RGBA cut-out as a single-channel PNG mask. */
export async function maskFromCutout(cutout: Buffer): Promise<Buffer> {
  return sharp(cutout).ensureAlpha().extractChannel("alpha").toColourspace("b-w").png().toBuffer();
}

/** Join a mask (L) onto the source RGB to produce the cut-out PNG. Source pixels are copied, never modified. */
export async function cutoutFromMask(source: Buffer, mask: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(source).metadata();
  const alpha = await sharp(mask).resize(width, height, { fit: "fill", kernel: "nearest" }).toColourspace("b-w").raw().toBuffer();
  return sharp(source).removeAlpha().joinChannel(alpha, { raw: { width: width!, height: height!, channels: 1 } }).png().toBuffer();
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
