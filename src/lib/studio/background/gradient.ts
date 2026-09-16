import sharp from "sharp";
import type { Size } from "../geometry";
import type { RenderedBackground } from "./types";

export type GradientStop = { offset: number; color: string };
export type GradientSpec =
  | { kind: "linear"; angle: number; stops: GradientStop[]; vignette?: number }
  | { kind: "radial"; cx?: number; cy?: number; r?: number; stops: GradientStop[]; vignette?: number };

/** Linear or radial gradient rendered through SVG (librsvg) — resolution independent and cheap. */
export function gradientSvg(size: Size, spec: GradientSpec): string {
  const stops = spec.stops.map((s) => `<stop offset="${Math.round(s.offset * 100)}%" stop-color="${s.color}"/>`).join("");
  const grad =
    spec.kind === "linear"
      ? `<linearGradient id="g" gradientTransform="rotate(${spec.angle} 0.5 0.5)">${stops}</linearGradient>`
      : `<radialGradient id="g" cx="${spec.cx ?? 0.5}" cy="${spec.cy ?? 0.45}" r="${spec.r ?? 0.75}">${stops}</radialGradient>`;
  const v = spec.vignette ?? 0;
  const vignette =
    v > 0
      ? `<radialGradient id="v" cx="0.5" cy="0.5" r="0.72"><stop offset="55%" stop-color="black" stop-opacity="0"/><stop offset="100%" stop-color="black" stop-opacity="${v.toFixed(3)}"/></radialGradient><rect width="100%" height="100%" fill="url(#v)"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><defs>${grad}</defs><rect width="100%" height="100%" fill="url(#g)"/>${vignette}</svg>`;
}

export async function renderGradient(size: Size, spec: GradientSpec): Promise<RenderedBackground> {
  const image = await sharp(Buffer.from(gradientSvg(size, spec))).removeAlpha().png().toBuffer();
  return { image, size, kind: "gradient", isPureWhite: false };
}
