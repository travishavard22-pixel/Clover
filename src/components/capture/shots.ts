"use client";
import { labelForShot } from "./shot-guide";

/** A photo taken (or picked) on the capture screen, kept in memory until upload. */
export type Shot = {
  id: string;
  blob: Blob;
  /** Object URL for preview; revoked when the shot is discarded. `null` when the browser cannot render the format (HEIC). */
  url: string | null;
  width: number;
  height: number;
  label: string;
  filename: string;
};

let counter = 0;
export function shotId() {
  counter += 1;
  return `shot-${Date.now().toString(36)}-${counter}`;
}

export function makeShot(blob: Blob, dims: { width: number; height: number }, index: number, filename?: string): Shot {
  let url: string | null = null;
  try {
    url = URL.createObjectURL(blob);
  } catch {
    url = null;
  }
  return { id: shotId(), blob, url, width: dims.width, height: dims.height, label: labelForShot(index), filename: filename ?? `clover-${index + 1}.jpg` };
}

export function releaseShot(shot: Shot) {
  if (shot.url) URL.revokeObjectURL(shot.url);
}

/** Reads a picked file's pixel size (0×0 when the browser cannot decode it, e.g. HEIC on desktop). */
export async function measureFile(file: File): Promise<{ width: number; height: number; renderable: boolean }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      const dims = { width: bmp.width, height: bmp.height, renderable: true };
      bmp.close();
      return dims;
    } catch {
      /* fall through to <img> probing */
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight, renderable: true });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0, renderable: false });
    };
    img.src = url;
  });
}

/** Re-labels shots after a reorder or delete so "Front / Back / …" still follow the sequence. */
export function relabelSequential(shots: Shot[]): Shot[] {
  return shots.map((s, i) => (s.label === labelForShot(i) ? s : { ...s, label: labelForShot(i) }));
}
