/**
 * Illuminant estimate for the enhancement-only path. Pure; no sharp.
 *
 * Grey-world over the whole frame assumes the scene averages to grey, which a warm table, a
 * coloured wall or a large single-colour item breaks — the correction then tints everything
 * towards the complement (a lavender cast on wood, for example). Instead the estimate uses only
 * bright, near-neutral pixels: paper, walls, labels, the sweep. Those are what a viewer reads as
 * "white", so making them neutral is the correction people expect, and a frame with no such
 * pixels is left alone rather than guessed at.
 */

export type WhiteBalanceEstimate = {
  /** Per-channel multipliers (r, g, b). All 1 when no correction is applied. */
  gains: [number, number, number];
  /** Fraction of sampled pixels that qualified as bright neutrals. */
  neutralFraction: number;
  /** False when too few neutral pixels were found and the gains are identity. */
  applied: boolean;
};

export type WhiteBalanceOptions = {
  /** Largest per-channel gain deviation from 1 (0.06 = ±6%). */
  maxGain?: number;
  /** Minimum share of sampled pixels that must be neutral before correcting. */
  minNeutralFraction?: number;
  /** Sample every Nth pixel for speed. */
  stride?: number;
};

const DEFAULTS: Required<WhiteBalanceOptions> = { maxGain: 0.06, minNeutralFraction: 0.01, stride: 7 };

/** A pixel counts as a bright neutral when it is light and its channels are close together. */
export function isBrightNeutral(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 150 && max <= 250 && max - min <= 40;
}

export function estimateWhiteBalance(data: Uint8Array | Buffer, width: number, height: number, channels: number, options: WhiteBalanceOptions = {}): WhiteBalanceEstimate {
  const { maxGain, minNeutralFraction, stride } = { ...DEFAULTS, ...options };
  const total = width * height;
  let sampled = 0;
  let n = 0;
  let sr = 0, sg = 0, sb = 0;
  for (let p = 0; p < total; p += stride) {
    const i = p * channels;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    sampled++;
    if (!isBrightNeutral(r, g, b)) continue;
    n++;
    sr += r;
    sg += g;
    sb += b;
  }
  const neutralFraction = sampled ? n / sampled : 0;
  if (!n || neutralFraction < minNeutralFraction) return { gains: [1, 1, 1], neutralFraction, applied: false };
  const mr = sr / n, mg = sg / n, mb = sb / n;
  const grey = (mr + mg + mb) / 3;
  const clamp = (v: number) => Math.min(1 + maxGain, Math.max(1 - maxGain, v));
  const gains: [number, number, number] = [clamp(grey / Math.max(1, mr)), clamp(grey / Math.max(1, mg)), clamp(grey / Math.max(1, mb))];
  const identity = gains.every((g) => Math.abs(g - 1) < 0.002);
  return { gains: identity ? [1, 1, 1] : gains, neutralFraction, applied: !identity };
}
