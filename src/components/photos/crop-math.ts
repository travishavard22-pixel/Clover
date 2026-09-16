/**
 * Pure geometry for the crop tool. Rectangles are in *image* pixels (PhotoDTO width × height);
 * the dialog converts to display pixels with a single uniform scale. Nothing here touches the DOM.
 */

export type Rect = { left: number; top: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type AspectPreset = "free" | "1:1" | "4:3" | "3:4" | "16:9";

export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function aspectValue(preset: AspectPreset): number | null {
  switch (preset) {
    case "1:1":
      return 1;
    case "4:3":
      return 4 / 3;
    case "3:4":
      return 3 / 4;
    case "16:9":
      return 16 / 9;
    default:
      return null;
  }
}

export function roundRect(r: Rect): Rect {
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

/** Starting crop: the whole image inset by 8% on each side (or the largest centred box of the aspect). */
export function defaultCrop(bounds: Size, aspect: number | null = null): Rect {
  const inset = 0.08;
  const box: Rect = { left: bounds.width * inset, top: bounds.height * inset, width: bounds.width * (1 - 2 * inset), height: bounds.height * (1 - 2 * inset) };
  return aspect ? fitAspect(box, aspect, bounds) : roundRect(box);
}

/** Keeps the rectangle inside the bounds and at least `minEdge` on each side, moving rather than shrinking when possible. */
export function clampRect(r: Rect, bounds: Size, minEdge: number): Rect {
  const maxEdge = Math.min(bounds.width, bounds.height);
  const min = Math.min(minEdge, maxEdge);
  let width = Math.max(min, Math.min(r.width, bounds.width));
  let height = Math.max(min, Math.min(r.height, bounds.height));
  let left = Math.max(0, Math.min(r.left, bounds.width - width));
  let top = Math.max(0, Math.min(r.top, bounds.height - height));
  // Guard against sub-pixel drift pushing us past the edge.
  if (left + width > bounds.width) width = bounds.width - left;
  if (top + height > bounds.height) height = bounds.height - top;
  left = Math.max(0, left);
  top = Math.max(0, top);
  return roundRect({ left, top, width, height });
}

export function moveRect(r: Rect, dx: number, dy: number, bounds: Size): Rect {
  const left = Math.max(0, Math.min(r.left + dx, bounds.width - r.width));
  const top = Math.max(0, Math.min(r.top + dy, bounds.height - r.height));
  return roundRect({ ...r, left, top });
}

/** Largest rectangle of `aspect` (w/h) that fits inside `r`, centred on it and clamped to bounds. */
export function fitAspect(r: Rect, aspect: number, bounds: Size): Rect {
  let width = r.width;
  let height = width / aspect;
  if (height > r.height) {
    height = r.height;
    width = height * aspect;
  }
  const left = r.left + (r.width - width) / 2;
  const top = r.top + (r.height - height) / 2;
  return clampRect({ left, top, width, height }, bounds, 1);
}

/**
 * Drags one handle by (dx, dy). Opposite edges stay anchored. With an aspect ratio the dominant
 * axis drives the other. Result is clamped to bounds and `minEdge`.
 */
export function resizeRect(r: Rect, handle: Handle, dx: number, dy: number, bounds: Size, minEdge: number, aspect: number | null = null): Rect {
  let { left, top, width, height } = r;
  const right = left + width;
  const bottom = top + height;
  const north = handle.includes("n");
  const south = handle.includes("s");
  const east = handle.includes("e");
  const west = handle.includes("w");

  if (west) left = Math.min(left + dx, right - minEdge);
  if (east) width = Math.max(minEdge, right + dx - left);
  if (west) width = right - left;
  if (north) top = Math.min(top + dy, bottom - minEdge);
  if (south) height = Math.max(minEdge, bottom + dy - top);
  if (north) height = bottom - top;

  if (aspect) {
    const horizontalOnly = (east || west) && !north && !south;
    const verticalOnly = (north || south) && !east && !west;
    if (horizontalOnly || (!verticalOnly && Math.abs(dx) >= Math.abs(dy))) {
      height = width / aspect;
      if (north) top = bottom - height;
    } else {
      width = height * aspect;
      if (west) left = right - width;
    }
  }

  // Clamp to bounds while keeping the anchored edges where they are.
  if (left < 0) {
    width += left;
    left = 0;
    if (aspect) {
      height = width / aspect;
      if (north) top = bottom - height;
    }
  }
  if (top < 0) {
    height += top;
    top = 0;
    if (aspect) {
      width = height * aspect;
      if (west) left = right - width;
    }
  }
  if (left + width > bounds.width) {
    width = bounds.width - left;
    if (aspect) {
      height = width / aspect;
      if (north) top = bottom - height;
    }
  }
  if (top + height > bounds.height) {
    height = bounds.height - top;
    if (aspect) {
      width = height * aspect;
      if (west) left = right - width;
    }
  }
  return clampRect({ left, top, width, height }, bounds, minEdge);
}

export function scaleRect(r: Rect, factor: number): Rect {
  return { left: r.left * factor, top: r.top * factor, width: r.width * factor, height: r.height * factor };
}

/** Uniform scale that fits `image` inside `viewport` without enlarging past 1:1. */
export function fitScale(image: Size, viewport: Size): number {
  if (!image.width || !image.height || !viewport.width || !viewport.height) return 1;
  return Math.min(1, viewport.width / image.width, viewport.height / image.height);
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/** True when the crop covers the whole image (so applying it would change nothing). */
export function isFullRect(r: Rect, bounds: Size): boolean {
  return r.left <= 0 && r.top <= 0 && r.left + r.width >= bounds.width && r.top + r.height >= bounds.height;
}

export function describeRect(r: Rect): string {
  return `${Math.round(r.width)} × ${Math.round(r.height)} px`;
}
