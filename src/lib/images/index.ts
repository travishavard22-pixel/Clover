import sharp from "sharp";

export type IngestedImage = { buffer: Buffer; width: number; height: number; mimeType: "image/jpeg"; bytes: number };

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif", "image/gif", "image/tiff"]);

/** Detects the real format from magic bytes (never trust the client's MIME type). */
export async function sniffImage(buffer: Buffer): Promise<{ format: string; width: number; height: number } | null> {
  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    if (!meta.format || !meta.width || !meta.height) return null;
    return { format: meta.format, width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

export function isAllowedMime(mime: string) {
  return ALLOWED.has(mime);
}

/**
 * Ingest an uploaded photo: validate, auto-orient from EXIF, strip ALL metadata (GPS, device),
 * re-encode as JPEG, and cap the long edge. Returns the canonical "original" we store.
 */
export async function ingestOriginal(buffer: Buffer, maxEdge = 2560): Promise<IngestedImage> {
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("Image is larger than 25 MB");
  const info = await sniffImage(buffer);
  if (!info) throw new Error("File is not a supported image");
  const out = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height, mimeType: "image/jpeg", bytes: out.data.length };
}

export async function makeVariant(buffer: Buffer, maxEdge: number, quality = 82): Promise<IngestedImage> {
  const out = await sharp(buffer).resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height, mimeType: "image/jpeg", bytes: out.data.length };
}

/** Square-ish thumbnail with cover crop for grids. */
export async function makeThumb(buffer: Buffer, size = 480): Promise<IngestedImage> {
  const out = await sharp(buffer).resize({ width: size, height: size, fit: "cover", position: "attention" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height, mimeType: "image/jpeg", bytes: out.data.length };
}

/** Version sized for vision models (≤1568px long edge keeps token cost in the standard tier). */
export async function forVision(buffer: Buffer): Promise<Buffer> {
  return (await makeVariant(buffer, 1568, 85)).buffer;
}

export async function applyTransform(buffer: Buffer, t: { rotate?: 0 | 90 | 180 | 270; crop?: { left: number; top: number; width: number; height: number } }): Promise<IngestedImage> {
  let s = sharp(buffer);
  if (t.crop) s = s.extract({ left: Math.round(t.crop.left), top: Math.round(t.crop.top), width: Math.round(t.crop.width), height: Math.round(t.crop.height) });
  if (t.rotate) s = s.rotate(t.rotate);
  const out = await s.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height, mimeType: "image/jpeg", bytes: out.data.length };
}

/** Basic enhancement: auto-levels, mild sharpening, white-balance normalisation. Never alters item geometry. */
export async function enhance(buffer: Buffer): Promise<IngestedImage> {
  const out = await sharp(buffer).normalise({ lower: 1, upper: 99 }).modulate({ saturation: 1.03 }).sharpen({ sigma: 0.8 }).jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height, mimeType: "image/jpeg", bytes: out.data.length };
}

export function imageHash(buffer: Buffer): string {
  // Cheap perceptual-ish key for demo determinism and caching: sha1 of a 16x16 grayscale downsample is computed by caller via sharp when needed.
  let h = 0;
  for (let i = 0; i < buffer.length; i += Math.max(1, Math.floor(buffer.length / 4096))) h = (h * 31 + buffer[i]!) >>> 0;
  return h.toString(16).padStart(8, "0");
}
