import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { checkClientFile, MAX_UPLOAD_BYTES, mimeForFormat, sniffFormat } from "@/lib/photos/mime";
import { isAllowedMime } from "@/lib/images";

const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...brand.split("").map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);

describe("sniffFormat", () => {
  it("recognises real encoder output", async () => {
    const base = sharp({ create: { width: 64, height: 64, channels: 3, background: "#1E7A4C" } });
    expect(sniffFormat(await base.clone().jpeg().toBuffer())).toBe("jpeg");
    expect(sniffFormat(await base.clone().png().toBuffer())).toBe("png");
    expect(sniffFormat(await base.clone().webp().toBuffer())).toBe("webp");
    expect(sniffFormat(await base.clone().gif().toBuffer())).toBe("gif");
    expect(sniffFormat(await base.clone().tiff().toBuffer())).toBe("tiff");
  });

  it("recognises ISO-BMFF brands for HEIC and AVIF", () => {
    expect(sniffFormat(ftyp("heic"))).toBe("heif");
    expect(sniffFormat(ftyp("mif1"))).toBe("heif");
    expect(sniffFormat(ftyp("avif"))).toBe("avif");
  });

  it("returns unknown for text and short buffers", () => {
    expect(sniffFormat(new TextEncoder().encode("<html><body>nope</body></html>"))).toBe("unknown");
    expect(sniffFormat(new Uint8Array([0xff, 0xd8]))).toBe("unknown");
  });

  it("maps to allowed MIME types that the image pipeline accepts", () => {
    for (const f of ["jpeg", "png", "webp", "gif", "tiff", "heif", "avif"] as const) {
      const mime = mimeForFormat(f);
      expect(mime).not.toBeNull();
      expect(isAllowedMime(mime!)).toBe(true);
    }
    expect(mimeForFormat("bmp")).toBeNull();
    expect(mimeForFormat("unknown")).toBeNull();
  });
});

describe("checkClientFile", () => {
  it("accepts images by type or by extension", () => {
    expect(checkClientFile({ name: "IMG_0001.HEIC", size: 1000, type: "" })).toEqual({ ok: true });
    expect(checkClientFile({ name: "blob", size: 1000, type: "image/jpeg" })).toEqual({ ok: true });
  });
  it("rejects empty, oversized and non-image files with a reason", () => {
    expect(checkClientFile({ name: "a.jpg", size: 0, type: "image/jpeg" }).ok).toBe(false);
    expect(checkClientFile({ name: "a.jpg", size: MAX_UPLOAD_BYTES + 1, type: "image/jpeg" }).ok).toBe(false);
    const r = checkClientFile({ name: "notes.pdf", size: 10, type: "application/pdf" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Not a photo/);
  });
});
