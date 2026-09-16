import sharp from "sharp";
import type { Rgb } from "../color";

/** Dominant colour of a whole image via sharp's 3D histogram. */
export async function dominantColour(image: Buffer): Promise<Rgb> {
  const stats = await sharp(image).stats();
  return stats.dominant;
}

/**
 * Dominant colour of the item only: pixels where the mask is set, binned at 5 bits per channel
 * (32 768 bins) on a 96px thumbnail; the answer is the mean of the busiest bin so it stays a real
 * colour rather than a bin centre. Falls back to the whole-image dominant when the mask is empty.
 */
export async function dominantColourMasked(source: Buffer, mask: Buffer, sample = 96): Promise<Rgb> {
  const meta = await sharp(source).metadata();
  const w = Math.max(1, Math.round((meta.width! / Math.max(meta.width!, meta.height!)) * sample));
  const h = Math.max(1, Math.round((meta.height! / Math.max(meta.width!, meta.height!)) * sample));
  const [rgb, m] = await Promise.all([
    sharp(source).removeAlpha().resize(w, h, { fit: "fill" }).raw().toBuffer(),
    sharp(mask).toColourspace("b-w").resize(w, h, { fit: "fill" }).raw().toBuffer(),
  ]);
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (let i = 0; i < w * h; i++) {
    if (m[i]! < 128) continue;
    const r = rgb[i * 3]!, g = rgb[i * 3 + 1]!, b = rgb[i * 3 + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let bin = counts.get(key);
    if (!bin) {
      bin = { n: 0, r: 0, g: 0, b: 0 };
      counts.set(key, bin);
    }
    bin.n++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    if (!best || bin.n > best.n) best = bin;
  }
  if (!best) return dominantColour(source);
  return { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n) };
}
