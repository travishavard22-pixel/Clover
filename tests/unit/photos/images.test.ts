import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyTransform, enhance, ingestOriginal, makeThumb, makeVariant, sniffImage } from "@/lib/images";

async function sample(width = 3000, height = 2000) {
  return sharp({ create: { width, height, channels: 3, background: "#DDF2E6" } })
    .jpeg({ quality: 80 })
    .withMetadata({ exif: { IFD0: { ImageDescription: "secret", Software: "test" } } })
    .toBuffer();
}

describe("image pipeline (sharp)", () => {
  it("ingests, caps the long edge and strips metadata", async () => {
    const buf = await sample();
    const out = await ingestOriginal(buf);
    expect(out.width).toBe(2560);
    expect(out.height).toBe(1707);
    expect(out.mimeType).toBe("image/jpeg");
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("makes a 1600px web variant and a square thumbnail", async () => {
    const orig = (await ingestOriginal(await sample())).buffer;
    const web = await makeVariant(orig, 1600);
    expect(Math.max(web.width, web.height)).toBe(1600);
    const thumb = await makeThumb(orig, 480);
    expect(thumb.width).toBe(480);
    expect(thumb.height).toBe(480);
  });

  it("rotates and crops without touching the source buffer", async () => {
    const orig = (await ingestOriginal(await sample(1200, 800))).buffer;
    const before = Buffer.from(orig);
    const rotated = await applyTransform(orig, { rotate: 90 });
    expect(rotated.width).toBe(800);
    expect(rotated.height).toBe(1200);
    const cropped = await applyTransform(orig, { crop: { left: 100, top: 50, width: 300, height: 200 } });
    expect(cropped.width).toBe(300);
    expect(cropped.height).toBe(200);
    expect(orig.equals(before)).toBe(true);
  });

  it("enhances while preserving dimensions", async () => {
    const orig = (await ingestOriginal(await sample(640, 480))).buffer;
    const out = await enhance(orig);
    expect(out.width).toBe(640);
    expect(out.height).toBe(480);
  });

  it("refuses non-images", async () => {
    expect(await sniffImage(Buffer.from("definitely not an image"))).toBeNull();
    await expect(ingestOriginal(Buffer.from("nope"))).rejects.toThrow(/not a supported image/);
  });
});
