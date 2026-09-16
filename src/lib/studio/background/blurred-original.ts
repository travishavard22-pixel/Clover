import sharp from "sharp";
import type { Size } from "../geometry";
import type { RenderedBackground } from "./types";

/**
 * LIFESTYLE fallback when no generator is configured: the original photo, cover-fitted to the
 * frame, Gaussian-blurred (σ≈30 at 1024px) and de-saturated so the item stays the subject.
 */
export async function renderBlurredOriginal(source: Buffer, size: Size, opts: { sigma?: number; saturation?: number; brightness?: number } = {}): Promise<RenderedBackground> {
  const longEdge = Math.max(size.width, size.height);
  const sigma = (opts.sigma ?? 30) * (longEdge / 1024);
  const image = await sharp(source)
    .removeAlpha()
    .resize(size.width, size.height, { fit: "cover", position: "centre" })
    .blur(Math.max(0.3, sigma))
    .modulate({ saturation: opts.saturation ?? 0.35, brightness: opts.brightness ?? 1.04 })
    .png()
    .toBuffer();
  return { image, size, kind: "blurred-original", isPureWhite: false, note: "Soft background (no generator configured)" };
}
