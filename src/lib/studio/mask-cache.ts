import { photoKey, storage } from "@/lib/storage";

/**
 * The item mask is the expensive, paid-for artefact of a render (one segmentation call per source
 * photo). It is cached in storage next to the source photo so every later mode, option change and
 * live preview reuses it instead of paying again. Stored at the render source size (≤ 2048px) as a
 * single-channel PNG where 255 = item.
 */
export function maskKey(userId: string, itemId: string, sourcePhotoId: string): string {
  return photoKey(userId, itemId, sourcePhotoId, "studio", "mask.png");
}

export async function loadCachedMask(userId: string, itemId: string, sourcePhotoId: string): Promise<Buffer | null> {
  return storage.get(maskKey(userId, itemId, sourcePhotoId));
}

export async function hasCachedMask(userId: string, itemId: string, sourcePhotoId: string): Promise<boolean> {
  return storage.exists(maskKey(userId, itemId, sourcePhotoId));
}

export async function storeMask(userId: string, itemId: string, sourcePhotoId: string, mask: Buffer): Promise<string> {
  const key = maskKey(userId, itemId, sourcePhotoId);
  await storage.put(key, mask, { contentType: "image/png", cacheControl: "private, max-age=31536000, immutable" });
  return key;
}

export async function deleteCachedMask(userId: string, itemId: string, sourcePhotoId: string): Promise<void> {
  await storage.delete(maskKey(userId, itemId, sourcePhotoId));
}
