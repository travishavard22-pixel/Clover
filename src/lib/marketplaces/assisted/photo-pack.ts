import JSZip from "jszip";
import sharp from "sharp";
import type { Marketplace, Photo } from "../../db";
import { storage } from "../../storage";
import { MARKETPLACES } from "../registry";
import { photoPackFilename, selectListingPhotos } from "../photos";

/** Long-edge cap for photo packs: every marketplace accepts 2000 px, and it keeps the ZIP small on mobile. */
export const PHOTO_PACK_MAX_EDGE = 2000;

export type PhotoPackPlan = Array<{ photo: Photo; filename: string }>;

/** Pure: which photos go into the pack and what they are called. */
export function planPhotoPack(photos: Photo[], marketplace: Marketplace): PhotoPackPlan {
  const selected = selectListingPhotos(photos, MARKETPLACES[marketplace].limits.photosMax);
  return selected.map((photo, i) => ({ photo, filename: photoPackFilename(i, selected.length) }));
}

/** Reads the highest-quality stored variant for a photo (full-resolution original when the upload kept one). */
async function bestBytes(photo: Photo): Promise<Buffer | null> {
  const prov = photo.provenance as { originalKey?: unknown } | null;
  const originalKey = typeof prov?.originalKey === "string" ? prov.originalKey : null;
  if (originalKey) {
    const orig = await storage.get(originalKey);
    if (orig) return orig;
  }
  return storage.get(photo.storageKey);
}

export async function resizeForPack(bytes: Buffer, maxEdge = PHOTO_PACK_MAX_EDGE): Promise<Buffer> {
  return sharp(bytes).rotate().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/** Builds the ZIP a seller downloads (or shares) to upload photos on an assisted marketplace. */
export async function buildPhotoPack(photos: Photo[], marketplace: Marketplace): Promise<{ zip: Buffer; count: number; skipped: number }> {
  const plan = planPhotoPack(photos, marketplace);
  const zip = new JSZip();
  let count = 0;
  let skipped = 0;
  for (const { photo, filename } of plan) {
    const bytes = await bestBytes(photo);
    if (!bytes) {
      skipped++;
      continue;
    }
    zip.file(filename, await resizeForPack(bytes), { date: photo.createdAt });
    count++;
  }
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  return { zip: out, count, skipped };
}

export function photoPackName(sku: string, marketplace: Marketplace): string {
  return `clover-${sku.toLowerCase()}-${MARKETPLACES[marketplace].shortName.toLowerCase().replace(/\s+/g, "-")}-photos.zip`;
}
