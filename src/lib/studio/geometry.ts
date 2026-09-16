import type { Aspect } from "./options";

/** Pure geometry for the compositor. Every function here is deterministic and unit-tested. */

export type Box = { left: number; top: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Tight bounding box of mask pixels above `threshold` (0..255). Null when the mask is empty. */
export function maskBoundingBox(data: Uint8Array, width: number, height: number, threshold = 8): Box | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x]! > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Fraction (0..1) of mask pixels at or above `threshold`. */
export function maskCoverage(data: Uint8Array, width: number, height: number, threshold = 128): number {
  let n = 0;
  const total = width * height;
  for (let i = 0; i < total; i++) if (data[i]! >= threshold) n++;
  return total === 0 ? 0 : n / total;
}

export function aspectRatio(aspect: Aspect, srcWidth: number, srcHeight: number): number {
  switch (aspect) {
    case "1:1":
      return 1;
    case "4:3":
      return 4 / 3;
    case "3:4":
      return 3 / 4;
    case "16:9":
      return 16 / 9;
    default:
      return srcWidth / srcHeight;
  }
}

/**
 * The output frame for a source and aspect. Long edge = min(maxEdge, source long edge) so we
 * never upscale a whole photo; the other edge follows the aspect. Always ≥ 16px and even.
 */
export function frameForAspect(srcWidth: number, srcHeight: number, aspect: Aspect, maxEdge: number): Size {
  const ratio = aspectRatio(aspect, srcWidth, srcHeight);
  const longEdge = Math.min(maxEdge, Math.max(srcWidth, srcHeight));
  let width: number, height: number;
  if (ratio >= 1) {
    width = longEdge;
    height = longEdge / ratio;
  } else {
    height = longEdge;
    width = longEdge * ratio;
  }
  const even = (v: number) => Math.max(16, Math.round(v / 2) * 2);
  return { width: even(width), height: even(height) };
}

export type Placement = { scale: number; left: number; top: number; width: number; height: number };

/**
 * Uniformly scale `item` so it fits inside `frame` minus `paddingPct` of the short edge on
 * every side, then centre it. Scale is the only resampling ever applied to the cut-out;
 * `maxUpscale` caps enlargement so small cut-outs are not blown up into mush.
 */
export function fitItem(item: Size, frame: Size, paddingPct: number, opts: { maxUpscale?: number; verticalBias?: number } = {}): Placement {
  const pad = (Math.min(frame.width, frame.height) * paddingPct) / 100;
  const availW = Math.max(1, frame.width - pad * 2);
  const availH = Math.max(1, frame.height - pad * 2);
  const raw = Math.min(availW / item.width, availH / item.height);
  const scale = Math.min(raw, opts.maxUpscale ?? 1.5);
  const width = Math.max(1, Math.round(item.width * scale));
  const height = Math.max(1, Math.round(item.height * scale));
  const bias = opts.verticalBias ?? 0; // −1 = top, +1 = bottom, 0 = centred
  const left = Math.round((frame.width - width) / 2);
  const free = frame.height - height;
  const top = Math.round(free / 2 + (free / 2) * bias);
  return { scale, left, top, width, height };
}

/**
 * A crop box around a focus point (0..1) magnified `zoom`× at the given aspect, clamped to the
 * source. Used by DETAIL (zoom 2) and CONDITION (zoom 1.6).
 */
export function focusCrop(srcWidth: number, srcHeight: number, focus: { x: number; y: number }, zoom: number, aspect: Aspect): Box {
  const ratio = aspectRatio(aspect, srcWidth, srcHeight);
  // Start from the largest box of the target aspect that fits the source, then divide by zoom.
  let w = srcWidth, h = srcWidth / ratio;
  if (h > srcHeight) {
    h = srcHeight;
    w = srcHeight * ratio;
  }
  w = Math.max(8, Math.round(w / zoom));
  h = Math.max(8, Math.round(h / zoom));
  const cx = focus.x * srcWidth;
  const cy = focus.y * srcHeight;
  const left = Math.round(Math.min(Math.max(0, cx - w / 2), srcWidth - w));
  const top = Math.round(Math.min(Math.max(0, cy - h / 2), srcHeight - h));
  return { left, top, width: w, height: h };
}

/** Where the focus point lands inside a crop box, in 0..1 of the box. */
export function focusWithinBox(srcWidth: number, srcHeight: number, focus: { x: number; y: number }, box: Box): { x: number; y: number } {
  const fx = (focus.x * srcWidth - box.left) / box.width;
  const fy = (focus.y * srcHeight - box.top) / box.height;
  return { x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
}

/** Largest centred crop of `aspect` inside the source (used by the enhance-only path). */
export function centredAspectCrop(srcWidth: number, srcHeight: number, aspect: Aspect): Box {
  const ratio = aspectRatio(aspect, srcWidth, srcHeight);
  let w = srcWidth, h = Math.round(srcWidth / ratio);
  if (h > srcHeight) {
    h = srcHeight;
    w = Math.round(srcHeight * ratio);
  }
  return { left: Math.round((srcWidth - w) / 2), top: Math.round((srcHeight - h) / 2), width: w, height: h };
}
