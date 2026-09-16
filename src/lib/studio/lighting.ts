import type { Lighting, ShadowType, StudioOptions } from "./options";

/** How the lighting preset shapes shadow and vignette. Pure. */
export type LightingParams = {
  /** Multiplier on the shadow blur radius. */
  shadowSigmaMul: number;
  /** Multiplier on the shadow opacity. */
  shadowOpacityMul: number;
  /** Vignette strength 0..1 applied to gradient/sweep backgrounds. */
  vignette: number;
  /** Floor darkening for the studio sweep (0..1). */
  sweepDepth: number;
};

export const LIGHTING: Record<Lighting, LightingParams> = {
  soft: { shadowSigmaMul: 1.4, shadowOpacityMul: 0.8, vignette: 0.06, sweepDepth: 0.05 },
  studio: { shadowSigmaMul: 1, shadowOpacityMul: 1, vignette: 0.1, sweepDepth: 0.08 },
  dramatic: { shadowSigmaMul: 0.8, shadowOpacityMul: 1.3, vignette: 0.3, sweepDepth: 0.16 },
};

export type ShadowParams = {
  type: ShadowType;
  /** Base blur σ at a 1024px frame (scaled with frame size). */
  sigma: number;
  opacity: number;
  /** Offsets as fraction of item height / width. */
  dy: number;
  dx: number;
  /** Vertical squash of the silhouette (1 = full silhouette, 0.3 = floor contact ellipse). */
  squash: number;
};

/** Resolve the user's shadow choice + lighting preset into concrete parameters. */
export function shadowParams(o: StudioOptions): ShadowParams | null {
  const L = LIGHTING[o.lighting];
  const opacity = Math.min(1, o.shadow.opacity * L.shadowOpacityMul);
  const dy = o.shadow.offset / 100;
  switch (o.shadow.type) {
    case "none":
      return null;
    case "contact":
      return { type: "contact", sigma: 12 * L.shadowSigmaMul, opacity, dy, dx: 0, squash: 0.3 };
    case "soft":
      return { type: "soft", sigma: 30 * L.shadowSigmaMul, opacity: opacity * 0.8, dy: dy * 0.5, dx: 0, squash: 1 };
    case "drop":
      return { type: "drop", sigma: 8 * L.shadowSigmaMul, opacity, dy, dx: dy * 0.6, squash: 1 };
  }
}
