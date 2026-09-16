import { randomUUID } from "node:crypto";
import { ApiError } from "../api";
import { db, type Photo, type Prisma } from "../db";
import { applyTransform, enhance as enhanceImage, imageHash, ingestOriginal, isAllowedMime, makeThumb, makeVariant, sniffImage } from "../images";
import { photoKey, storage } from "../storage";
import { MAX_PHOTOS_PER_ITEM, MAX_UPLOAD_BYTES, mimeForFormat, sniffFormat } from "./mime";
import { ancestorsOf, descendantsOf, nextSortOrder, planReorder, rootOf, SUPERSEDED_SORT_BASE, visiblePhotos } from "./order";
import { describeTransform, isNoopTransform, scaleCrop, type TransformRequest, validateCrop } from "./transform";

/** Long edge of the variant we serve in the app. Full resolution stays in `provenance.originalKey`. */
export const WEB_EDGE = 1600;
export const THUMB_SIZE = 480;

export type UploadProvenance = {
  pipeline: "upload";
  originalKey: string;
  hash: string;
  sourceFormat: string;
  sourceBytes: number;
  uploadedAt: string;
};

export type TransformProvenance = {
  pipeline: "transform";
  provider: "sharp";
  originalKey: string;
  hash: string;
  sourcePhotoId: string;
  ops: { rotate?: number; crop?: { left: number; top: number; width: number; height: number }; enhance?: boolean };
  summary: string;
  at: string;
};

/** Reads the full-resolution key stored at upload time; falls back to the display key for legacy rows. */
export function originalKeyOf(photo: Pick<Photo, "storageKey" | "provenance">): string {
  const prov = photo.provenance as { originalKey?: unknown } | null;
  return typeof prov?.originalKey === "string" ? prov.originalKey : photo.storageKey;
}

async function storeVariants(userId: string, itemId: string, photoId: string, full: Buffer) {
  const [web, thumb] = await Promise.all([makeVariant(full, WEB_EDGE), makeThumb(full, THUMB_SIZE)]);
  const origKey = photoKey(userId, itemId, photoId, "orig");
  const webKey = photoKey(userId, itemId, photoId, "web");
  const thumbKey = photoKey(userId, itemId, photoId, "thumb");
  await Promise.all([
    storage.put(origKey, full, { contentType: "image/jpeg", cacheControl: "private, max-age=31536000, immutable" }),
    storage.put(webKey, web.buffer, { contentType: "image/jpeg", cacheControl: "private, max-age=31536000, immutable" }),
    storage.put(thumbKey, thumb.buffer, { contentType: "image/jpeg", cacheControl: "private, max-age=31536000, immutable" }),
  ]);
  return { origKey, webKey, thumbKey, web };
}

async function removeVariants(keys: string[]) {
  await Promise.allSettled(keys.map((k) => storage.delete(k)));
}

export async function listPhotos(itemId: string) {
  return db.photo.findMany({ where: { itemId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

/**
 * Validates and stores an uploaded photo: sniff the real format, re-encode through sharp (which
 * strips EXIF/GPS and defuses malformed files), and write orig / web / thumb variants.
 */
export async function storeUploadedPhoto(input: { userId: string; itemId: string; bytes: Buffer; label?: string | null }): Promise<Photo> {
  const { userId, itemId, bytes } = input;
  if (bytes.length === 0) throw new ApiError(400, "The file is empty", "empty_file");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ApiError(413, "Photos must be 25 MB or smaller", "too_large");

  const container = sniffFormat(bytes);
  const mime = mimeForFormat(container);
  if (!mime || !isAllowedMime(mime)) throw new ApiError(415, "That file is not a photo we can read (JPEG, PNG, WebP, HEIC, AVIF, GIF or TIFF)", "unsupported_type");

  const sniffed = await sniffImage(bytes);
  if (!sniffed) {
    if (container === "heif") throw new ApiError(415, "This server cannot decode HEIC. Export the photo as JPEG and try again.", "heic_unsupported");
    throw new ApiError(415, "The file looks like an image but could not be decoded", "undecodable");
  }

  const existing = await listPhotos(itemId);
  if (visiblePhotos(existing).length >= MAX_PHOTOS_PER_ITEM) throw new ApiError(409, `An item can have at most ${MAX_PHOTOS_PER_ITEM} photos`, "too_many_photos");

  let ingested;
  try {
    ingested = await ingestOriginal(bytes);
  } catch (err) {
    throw new ApiError(415, err instanceof Error ? err.message : "Could not process the image", "ingest_failed");
  }

  const photoId = randomUUID();
  const { origKey, webKey, thumbKey, web } = await storeVariants(userId, itemId, photoId, ingested.buffer);
  const provenance: UploadProvenance = {
    pipeline: "upload",
    originalKey: origKey,
    hash: imageHash(ingested.buffer),
    sourceFormat: sniffed.format,
    sourceBytes: bytes.length,
    uploadedAt: new Date().toISOString(),
  };
  try {
    return await db.photo.create({
      data: {
        id: photoId,
        itemId,
        kind: "ORIGINAL",
        storageKey: webKey,
        thumbKey,
        mimeType: "image/jpeg",
        width: web.width,
        height: web.height,
        bytes: web.bytes,
        sortOrder: nextSortOrder(existing),
        label: input.label?.trim().slice(0, 80) || null,
        provenance: provenance as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    await removeVariants([origKey, webKey, thumbKey]);
    throw err;
  }
}

export async function reorderPhotos(itemId: string, order: string[]) {
  const photos = await listPhotos(itemId);
  const plan = planReorder(photos, order);
  if (!plan.ok) throw new ApiError(400, plan.reason, "bad_order");
  await db.$transaction(plan.updates.map((u) => db.photo.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } })));
  return listPhotos(itemId);
}

export async function updatePhotoLabel(itemId: string, photoId: string, label: string | null) {
  const photo = await db.photo.findFirst({ where: { id: photoId, itemId } });
  if (!photo) throw new ApiError(404, "Photo not found", "not_found");
  return db.photo.update({ where: { id: photoId }, data: { label: label?.trim().slice(0, 80) || null } });
}

function storageKeysOf(p: Photo): string[] {
  const keys = new Set<string>([p.storageKey]);
  if (p.thumbKey) keys.add(p.thumbKey);
  keys.add(originalKeyOf(p));
  return [...keys];
}

/**
 * Deletes a photo together with everything derived from it and every superseded edit source
 * above it (which would otherwise reappear in the grid). Storage objects are removed after the
 * rows so a failed delete never leaves dangling references.
 */
export async function deletePhoto(itemId: string, photoId: string) {
  const photos = await listPhotos(itemId);
  const target = photos.find((p) => p.id === photoId);
  if (!target) throw new ApiError(404, "Photo not found", "not_found");
  const doomed = [target, ...descendantsOf(target, photos), ...ancestorsOf(target, photos)];
  const ids = [...new Set(doomed.map((p) => p.id))];
  await db.photo.deleteMany({ where: { id: { in: ids }, itemId } });
  await removeVariants(doomed.flatMap(storageKeysOf));
  const remaining = photos.filter((p) => !ids.includes(p.id));
  // Close the gap so sortOrder stays dense for the visible sequence.
  const vis = visiblePhotos(remaining);
  await db.$transaction(vis.map((p, i) => db.photo.update({ where: { id: p.id }, data: { sortOrder: i } })));
  return listPhotos(itemId);
}

/**
 * Applies rotate / crop / enhance to the full-resolution original of `sourceId` and stores the
 * result as a NEW photo (kind ENHANCED) at the source's position. The source is never modified;
 * it is pushed to the tail and hidden by the visibility rule until "Use original".
 */
export async function transformPhoto(input: { userId: string; itemId: string; sourceId: string; request: TransformRequest }): Promise<Photo> {
  const { userId, itemId, sourceId, request } = input;
  const photos = await listPhotos(itemId);
  const source = photos.find((p) => p.id === sourceId);
  if (!source) throw new ApiError(404, "Photo not found", "not_found");
  if (request.useOriginal) return restoreOriginal(itemId, source, photos);
  if (isNoopTransform(request)) throw new ApiError(400, "Nothing to apply — choose a rotation, crop or enhancement", "noop");

  const fullKey = originalKeyOf(source);
  const full = (await storage.get(fullKey)) ?? (await storage.get(source.storageKey));
  if (!full) throw new ApiError(410, "The source file is no longer in storage", "missing_source");
  const fullMeta = await sniffImage(full);
  if (!fullMeta) throw new ApiError(500, "The stored source could not be read", "unreadable_source");

  const ops: TransformProvenance["ops"] = {};
  let working: Buffer = full;
  if (request.crop) {
    const check = validateCrop(request.crop, { width: source.width, height: source.height });
    if (!check.ok) throw new ApiError(400, check.reason, "bad_crop");
    ops.crop = scaleCrop(check.crop, { width: source.width, height: source.height }, { width: fullMeta.width, height: fullMeta.height });
  }
  if (request.rotate) ops.rotate = request.rotate;
  if (ops.crop || ops.rotate) working = (await applyTransform(working, { rotate: ops.rotate as 0 | 90 | 180 | 270 | undefined, crop: ops.crop })).buffer;
  if (request.enhance) {
    ops.enhance = true;
    working = (await enhanceImage(working)).buffer;
  }

  const photoId = randomUUID();
  const { origKey, webKey, thumbKey, web } = await storeVariants(userId, itemId, photoId, working);
  const provenance: TransformProvenance = {
    pipeline: "transform",
    provider: "sharp",
    originalKey: origKey,
    hash: imageHash(working),
    sourcePhotoId: source.id,
    ops,
    summary: describeTransform(request),
    at: new Date().toISOString(),
  };
  try {
    const [created] = await db.$transaction([
      db.photo.create({
        data: {
          id: photoId,
          itemId,
          kind: "ENHANCED",
          storageKey: webKey,
          thumbKey,
          mimeType: "image/jpeg",
          width: web.width,
          height: web.height,
          bytes: web.bytes,
          sortOrder: source.sortOrder,
          sourcePhotoId: source.id,
          label: source.label,
          aiGenerated: false,
          provenance: provenance as unknown as Prisma.InputJsonValue,
        },
      }),
      db.photo.update({ where: { id: source.id }, data: { sortOrder: source.sortOrder < SUPERSEDED_SORT_BASE ? SUPERSEDED_SORT_BASE + source.sortOrder : source.sortOrder } }),
    ]);
    return created;
  } catch (err) {
    await removeVariants([origKey, webKey, thumbKey]);
    throw err;
  }
}

/** Discards an edit chain and puts the immutable original back in the edited photo's slot. */
async function restoreOriginal(itemId: string, edited: Photo, photos: Photo[]): Promise<Photo> {
  const root = rootOf(edited, photos);
  if (root.id === edited.id) throw new ApiError(400, "This is already the original photo", "already_original");
  const chain = [edited, ...ancestorsOf(edited, photos).filter((p) => p.id !== root.id)];
  const ids = chain.map((p) => p.id);
  const [restored] = await db.$transaction([
    db.photo.update({ where: { id: root.id }, data: { sortOrder: edited.sortOrder } }),
    db.photo.deleteMany({ where: { id: { in: ids }, itemId } }),
  ]);
  await removeVariants(chain.flatMap(storageKeysOf));
  return restored;
}
