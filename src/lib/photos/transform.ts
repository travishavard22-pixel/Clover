import { z } from "zod";

/**
 * Transform request validation (pure). Crop coordinates are expressed in the pixel space of the
 * photo the client displays (`PhotoDTO.width` × `PhotoDTO.height`, the 1600px web variant). The
 * server rescales them to the full-resolution original before cutting, so no quality is lost.
 */

export const RotateSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const CropSchema = z.object({
  left: z.number().finite().min(0),
  top: z.number().finite().min(0),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const TransformRequestSchema = z
  .object({
    rotate: RotateSchema.optional(),
    crop: CropSchema.optional(),
    enhance: z.boolean().optional(),
    /** Restore the immutable original this photo was edited from (discards the edit chain). */
    useOriginal: z.boolean().optional(),
  })
  .strict();

export type TransformRequest = z.infer<typeof TransformRequestSchema>;
export type Crop = z.infer<typeof CropSchema>;

export const MIN_CROP_EDGE = 64;

export function isNoopTransform(t: TransformRequest): boolean {
  return !t.useOriginal && !t.enhance && !t.rotate && !t.crop;
}

export type CropCheck = { ok: true; crop: Crop } | { ok: false; reason: string };

/** Clamps a crop into the source bounds; rejects crops that are out of range or too small to be useful. */
export function validateCrop(crop: Crop, source: { width: number; height: number }): CropCheck {
  const left = Math.max(0, Math.floor(crop.left));
  const top = Math.max(0, Math.floor(crop.top));
  const right = Math.min(source.width, Math.ceil(crop.left + crop.width));
  const bottom = Math.min(source.height, Math.ceil(crop.top + crop.height));
  const width = right - left;
  const height = bottom - top;
  if (crop.left >= source.width || crop.top >= source.height) return { ok: false, reason: "Crop starts outside the photo" };
  if (width < MIN_CROP_EDGE || height < MIN_CROP_EDGE) return { ok: false, reason: `Crop must be at least ${MIN_CROP_EDGE}px on each side` };
  return { ok: true, crop: { left, top, width, height } };
}

/** Rescales a crop from display pixels to full-resolution pixels (uniform scale; the variants keep aspect). */
export function scaleCrop(crop: Crop, from: { width: number; height: number }, to: { width: number; height: number }): Crop {
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  const left = Math.round(crop.left * sx);
  const top = Math.round(crop.top * sy);
  const width = Math.min(to.width - left, Math.round(crop.width * sx));
  const height = Math.min(to.height - top, Math.round(crop.height * sy));
  return { left, top, width, height };
}

/** Human-readable summary of an edit for provenance and the UI ("Rotated 90°, cropped"). */
export function describeTransform(t: TransformRequest): string {
  const parts: string[] = [];
  if (t.rotate) parts.push(`Rotated ${t.rotate}°`);
  if (t.crop) parts.push("Cropped");
  if (t.enhance) parts.push("Enhanced");
  return parts.join(", ") || "Unchanged";
}
