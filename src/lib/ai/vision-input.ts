import type { Photo } from "../db";
import { forVision } from "../images";
import { originalKeyOf } from "../photos/store";
import { storage } from "../storage";
import type { ImageInput } from "./provider";

/** Research §1.1: keep requests to ≤ 12 photos, each ≤ 1568 px on the long edge. */
export const MAX_VISION_PHOTOS = 12;

export type VisionPhoto = { photo: Photo; image: ImageInput; /** 1-based index the model cites in `evidenceImage`. */ index: number };

/**
 * Loads the visible photos of an item as model-ready images. Reads the 1600 px web derivative
 * (`storageKey`); when a photo has no derivative in storage it falls back to the full-resolution
 * original recorded in `provenance.originalKey`. Photos whose bytes cannot be read are skipped so a
 * single missing file never blocks identification; the caller reports how many were prepared.
 */
export async function loadVisionPhotos(photos: Photo[], max = MAX_VISION_PHOTOS): Promise<{ prepared: VisionPhoto[]; skipped: Photo[] }> {
  const prepared: VisionPhoto[] = [];
  const skipped: Photo[] = [];
  for (const photo of photos.slice(0, max)) {
    const bytes = (await storage.get(photo.storageKey)) ?? (await storage.get(originalKeyOf(photo)));
    if (!bytes) {
      skipped.push(photo);
      continue;
    }
    try {
      const data = await forVision(bytes);
      prepared.push({ photo, index: prepared.length + 1, image: { data, mimeType: "image/jpeg", label: visionLabel(photo) } });
    } catch (err) {
      console.error(`[vision] could not prepare photo ${photo.id}`, err);
      skipped.push(photo);
    }
  }
  return { prepared, skipped };
}

/** A short label the model sees next to each photo ("Photo 2 (label close-up)"). */
export function visionLabel(photo: Pick<Photo, "label" | "kind" | "studioMode">): string | undefined {
  if (photo.label) return photo.label;
  if (photo.kind === "CONDITION") return "condition detail";
  if (photo.kind === "STUDIO") return `studio render${photo.studioMode ? ` (${photo.studioMode.toLowerCase().replace("_", " ")})` : ""}`;
  return undefined;
}
