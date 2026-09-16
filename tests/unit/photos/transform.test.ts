import { describe, expect, it } from "vitest";
import { describeTransform, isNoopTransform, scaleCrop, TransformRequestSchema, validateCrop } from "@/lib/photos/transform";

describe("TransformRequestSchema", () => {
  it("accepts the documented shapes", () => {
    expect(TransformRequestSchema.parse({ rotate: 90 })).toEqual({ rotate: 90 });
    expect(TransformRequestSchema.parse({ crop: { left: 0, top: 0, width: 100, height: 100 }, enhance: true })).toMatchObject({ enhance: true });
    expect(TransformRequestSchema.parse({ useOriginal: true })).toEqual({ useOriginal: true });
  });

  it("rejects bad rotations, negative crops and unknown keys", () => {
    expect(TransformRequestSchema.safeParse({ rotate: 45 }).success).toBe(false);
    expect(TransformRequestSchema.safeParse({ crop: { left: -1, top: 0, width: 10, height: 10 } }).success).toBe(false);
    expect(TransformRequestSchema.safeParse({ crop: { left: 0, top: 0, width: 0, height: 10 } }).success).toBe(false);
    expect(TransformRequestSchema.safeParse({ flip: true }).success).toBe(false);
  });

  it("detects no-op requests", () => {
    expect(isNoopTransform({})).toBe(true);
    expect(isNoopTransform({ rotate: 0 })).toBe(true);
    expect(isNoopTransform({ rotate: 90 })).toBe(false);
    expect(isNoopTransform({ enhance: true })).toBe(false);
    expect(isNoopTransform({ useOriginal: true })).toBe(false);
  });
});

describe("validateCrop", () => {
  const src = { width: 1600, height: 1200 };
  it("clamps a crop that overflows the edge", () => {
    const r = validateCrop({ left: 1500, top: 1100, width: 500, height: 500 }, src);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.crop).toEqual({ left: 1500, top: 1100, width: 100, height: 100 });
  });
  it("rejects crops that start outside or are too small", () => {
    expect(validateCrop({ left: 1600, top: 0, width: 10, height: 10 }, src).ok).toBe(false);
    expect(validateCrop({ left: 0, top: 0, width: 20, height: 500 }, src).ok).toBe(false);
  });
  it("floors fractional coordinates", () => {
    const r = validateCrop({ left: 10.7, top: 20.2, width: 300.4, height: 200.9 }, src);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.crop).toEqual({ left: 10, top: 20, width: 302, height: 202 });
  });
});

describe("scaleCrop", () => {
  it("maps display pixels to full-resolution pixels without overflowing", () => {
    const c = scaleCrop({ left: 100, top: 50, width: 800, height: 600 }, { width: 1600, height: 1200 }, { width: 2560, height: 1920 });
    expect(c).toEqual({ left: 160, top: 80, width: 1280, height: 960 });
    const edge = scaleCrop({ left: 1500, top: 1100, width: 100, height: 100 }, { width: 1600, height: 1200 }, { width: 2560, height: 1920 });
    expect(edge.left + edge.width).toBeLessThanOrEqual(2560);
    expect(edge.top + edge.height).toBeLessThanOrEqual(1920);
  });
});

describe("describeTransform", () => {
  it("names each operation", () => {
    expect(describeTransform({ rotate: 90, crop: { left: 0, top: 0, width: 1, height: 1 }, enhance: true })).toBe("Rotated 90°, Cropped, Enhanced");
    expect(describeTransform({})).toBe("Unchanged");
  });
});
