import { describe, expect, it } from "vitest";
import { centredAspectCrop, fitItem, focusCrop, focusWithinBox, frameForAspect, maskBoundingBox, maskCoverage } from "@/lib/studio/geometry";

describe("studio geometry", () => {
  it("finds the tight bounding box of a mask and null for an empty one", () => {
    const w = 10, h = 8;
    const m = new Uint8Array(w * h);
    for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) m[y * w + x] = 255;
    m[0] = 4; // below threshold, ignored
    expect(maskBoundingBox(m, w, h)).toEqual({ left: 3, top: 2, width: 5, height: 4 });
    expect(maskBoundingBox(new Uint8Array(w * h), w, h)).toBeNull();
    expect(maskCoverage(m, w, h)).toBeCloseTo(20 / 80);
  });

  it("frames never upscale the whole photo and follow the aspect", () => {
    expect(frameForAspect(4000, 3000, "original", 2048)).toEqual({ width: 2048, height: 1536 });
    expect(frameForAspect(400, 300, "1:1", 2048)).toEqual({ width: 400, height: 400 });
    expect(frameForAspect(400, 300, "4:3", 2048)).toEqual({ width: 400, height: 300 });
    expect(frameForAspect(400, 300, "3:4", 2048)).toEqual({ width: 300, height: 400 });
    expect(frameForAspect(1600, 1600, "16:9", 2048)).toEqual({ width: 1600, height: 900 });
    const f = frameForAspect(333, 111, "16:9", 2048);
    expect(f.width % 2).toBe(0);
    expect(f.height % 2).toBe(0);
  });

  it("fits an item with padding using a single uniform scale, centred", () => {
    const p = fitItem({ width: 280, height: 180 }, { width: 400, height: 300 }, 20);
    expect(p.scale).toBe(1);
    expect(p).toMatchObject({ left: 60, top: 60, width: 280, height: 180 });
    const up = fitItem({ width: 50, height: 50 }, { width: 400, height: 400 }, 8);
    expect(up.scale).toBe(1.5); // capped enlargement
    const down = fitItem({ width: 1000, height: 200 }, { width: 400, height: 300 }, 0);
    expect(down.scale).toBeCloseTo(0.4);
    expect(down.width).toBe(400);
    expect(down.height).toBe(80);
    const biased = fitItem({ width: 100, height: 100 }, { width: 400, height: 400 }, 0, { verticalBias: 0.5 });
    expect(biased.top).toBeGreaterThan((400 - 100) / 2);
  });

  it("clamps focus crops to the source and reports where the focus lands", () => {
    const c = focusCrop(400, 300, { x: 0.5, y: 0.5 }, 2, "original");
    expect(c).toEqual({ left: 100, top: 75, width: 200, height: 150 });
    const corner = focusCrop(400, 300, { x: 0, y: 0 }, 2, "original");
    expect(corner.left).toBe(0);
    expect(corner.top).toBe(0);
    const edge = focusCrop(400, 300, { x: 1, y: 1 }, 2, "1:1");
    expect(edge.left + edge.width).toBe(400);
    expect(edge.top + edge.height).toBe(300);
    const f = focusWithinBox(400, 300, { x: 0, y: 0 }, corner);
    expect(f).toEqual({ x: 0, y: 0 });
    const g = focusWithinBox(400, 300, { x: 0.5, y: 0.5 }, c);
    expect(g.x).toBeCloseTo(0.5);
    expect(g.y).toBeCloseTo(0.5);
  });

  it("centred aspect crop is the largest box of that aspect", () => {
    expect(centredAspectCrop(400, 300, "1:1")).toEqual({ left: 50, top: 0, width: 300, height: 300 });
    expect(centredAspectCrop(300, 400, "16:9")).toEqual({ left: 0, top: 116, width: 300, height: 169 });
  });
});
