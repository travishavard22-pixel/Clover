import sharp from "sharp";
import { hexToRgb, mix, rgbToHex } from "../color";
import type { Size } from "../geometry";
import { gradientSvg } from "./gradient";
import type { RenderedBackground } from "./types";

/**
 * A photographer's "sweep": the wall (top) blends into the floor (bottom) with a faint horizon.
 * `depth` is how much darker the floor gets (0..1); the lighting preset supplies it.
 */
export async function renderStudioSweep(size: Size, baseHex: string, opts: { depth: number; vignette: number }): Promise<RenderedBackground> {
  const base = hexToRgb(baseHex);
  const dark = { r: 0, g: 0, b: 0 };
  const light = { r: 255, g: 255, b: 255 };
  const wallTop = rgbToHex(mix(base, light, 0.04));
  const horizon = rgbToHex(base);
  const floor = rgbToHex(mix(base, dark, opts.depth));
  const svg = gradientSvg(size, {
    kind: "linear",
    angle: 90,
    stops: [
      { offset: 0, color: wallTop },
      { offset: 0.58, color: horizon },
      { offset: 0.62, color: rgbToHex(mix(base, dark, opts.depth * 0.35)) },
      { offset: 1, color: floor },
    ],
    vignette: opts.vignette,
  });
  const image = await sharp(Buffer.from(svg)).removeAlpha().png().toBuffer();
  return { image, size, kind: "studio-sweep", isPureWhite: false };
}
