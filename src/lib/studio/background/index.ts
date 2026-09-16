import { boldComplement, hexToRgb, mix, rgbToHex, type Rgb } from "../color";
import type { Size } from "../geometry";
import { LIGHTING } from "../lighting";
import type { StudioModeId } from "../modes";
import { STUDIO_MODES } from "../modes";
import { resolveBackgroundHex, type StudioOptions } from "../options";
import { renderBlurredOriginal } from "./blurred-original";
import { getBackgroundGenerator } from "./generator";
import { renderGradient } from "./gradient";
import { renderSolid } from "./solid";
import { renderStudioSweep } from "./studio-sweep";
import type { RenderedBackground } from "./types";

export * from "./types";
export { renderSolid } from "./solid";
export { renderGradient, gradientSvg } from "./gradient";
export { renderStudioSweep } from "./studio-sweep";
export { renderBlurredOriginal } from "./blurred-original";
export { dominantColour, dominantColourMasked } from "./dominant";

export type BackgroundContext = {
  /** Original photo (for the blurred fallback and generators). */
  source: Buffer;
  /** Item mask (for generators). */
  mask?: Buffer;
  /** Dominant colour of the item (for SOCIAL's auto colour). */
  itemDominant?: Rgb;
  /** Scene prompt for LIFESTYLE generators. */
  scenePrompt?: string;
};

/** Pick and render the background a mode wants at the given frame. Pure apart from sharp. */
export async function renderBackgroundForMode(mode: StudioModeId, options: StudioOptions, size: Size, ctx: BackgroundContext): Promise<RenderedBackground> {
  const spec = STUDIO_MODES[mode];
  const L = LIGHTING[options.lighting];
  const userPicked = options.background !== "auto";
  const hex = resolveBackgroundHex(options.background, spec.autoBackgroundHex);

  switch (mode) {
    case "ECOMMERCE":
      return renderSolid(size, hex);
    case "CLEAN_STUDIO":
      return renderStudioSweep(size, hex, { depth: L.sweepDepth, vignette: L.vignette * 0.5 });
    case "MARKETPLACE": {
      const base = hexToRgb(hex);
      return renderGradient(size, {
        kind: "linear",
        angle: 90,
        stops: [
          { offset: 0, color: rgbToHex(mix(base, { r: 255, g: 255, b: 255 }, 0.5)) },
          { offset: 1, color: rgbToHex(mix(base, { r: 0, g: 0, b: 0 }, 0.06)) },
        ],
        vignette: L.vignette * 0.4,
      });
    }
    case "LUXURY": {
      const base = hexToRgb(hex);
      const rim = rgbToHex(mix(base, { r: 255, g: 255, b: 255 }, 0.14));
      const deep = rgbToHex(mix(base, { r: 0, g: 0, b: 0 }, 0.75));
      return renderGradient(size, { kind: "radial", cx: 0.5, cy: 0.42, r: 0.8, stops: [{ offset: 0, color: rim }, { offset: 0.55, color: rgbToHex(base) }, { offset: 1, color: deep }], vignette: L.vignette });
    }
    case "SOCIAL": {
      const colour = userPicked ? hexToRgb(hex) : boldComplement(ctx.itemDominant ?? hexToRgb(spec.autoBackgroundHex));
      return renderSolid(size, rgbToHex(colour));
    }
    case "LIFESTYLE": {
      const gen = getBackgroundGenerator();
      if (gen && ctx.mask) {
        const out = await gen.generate({ source: ctx.source, mask: ctx.mask, prompt: ctx.scenePrompt ?? "soft daylight, neutral tabletop, shallow depth of field", size });
        return { image: out.image, size, kind: `generator:${gen.name}`, isPureWhite: false, model: out.model };
      }
      if (userPicked) return renderStudioSweep(size, hex, { depth: L.sweepDepth, vignette: L.vignette });
      return renderBlurredOriginal(ctx.source, size);
    }
    case "DETAIL":
    case "CONDITION":
      // These keep the original background; a solid is only used if a caller asks anyway.
      return renderSolid(size, hex);
  }
}
