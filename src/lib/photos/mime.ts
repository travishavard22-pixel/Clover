/**
 * Pure helpers for deciding whether an upload is worth sending to sharp. The server never trusts
 * the client MIME type; these run on the first bytes of the file.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTOS_PER_ITEM = 24;

/** Extensions we accept in file pickers (HEIC included so iPhone shots can be sent as-is). */
export const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".gif", ".tif", ".tiff"] as const;
export const ACCEPT_ATTRIBUTE = ["image/*", ...ACCEPTED_EXTENSIONS].join(",");

export type SniffedFormat = "jpeg" | "png" | "webp" | "gif" | "tiff" | "heif" | "avif" | "bmp" | "unknown";

/** Detects the container from magic bytes. Fast, allocation-free; sharp does the real decode. */
export function sniffFormat(bytes: Uint8Array): SniffedFormat {
  if (bytes.length < 12) return "unknown";
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "bmp";
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)) return "tiff";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (brand === "avif" || brand === "avis") return "avif";
    if (brand.startsWith("hei") || brand === "mif1" || brand === "msf1") return "heif";
  }
  return "unknown";
}

export function mimeForFormat(f: SniffedFormat): string | null {
  switch (f) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "tiff":
      return "image/tiff";
    case "heif":
      return "image/heic";
    case "avif":
      return "image/avif";
    default:
      return null;
  }
}

export type ClientFileCheck = { ok: true } | { ok: false; reason: string };

/** Client-side pre-flight for a picked file (server re-validates from bytes). */
export function checkClientFile(file: { name: string; size: number; type: string }): ClientFileCheck {
  if (file.size === 0) return { ok: false, reason: "The file is empty" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "Larger than 25 MB" };
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  const extOk = (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
  const typeOk = file.type.startsWith("image/");
  if (!extOk && !typeOk) return { ok: false, reason: "Not a photo (JPEG, PNG, WebP, HEIC)" };
  return { ok: true };
}
