import { describe, expect, it } from "vitest";
import { estimateWhiteBalance, isBrightNeutral } from "@/lib/studio/white-balance";

/** Builds a raw RGB frame from a per-pixel colour function. */
function frame(width: number, height: number, at: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = at(x, y);
      const i = (y * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return data;
}

describe("white balance from bright neutrals", () => {
  it("classifies bright neutrals and rejects colours, shadows and clipped highlights", () => {
    expect(isBrightNeutral(220, 218, 224)).toBe(true);
    expect(isBrightNeutral(200, 190, 175)).toBe(true); // a warm-lit wall still counts
    expect(isBrightNeutral(210, 150, 120)).toBe(false); // wood
    expect(isBrightNeutral(235, 205, 170)).toBe(false); // too strong a cast to call white
    expect(isBrightNeutral(90, 92, 95)).toBe(false); // too dark to read as white
    expect(isBrightNeutral(255, 255, 255)).toBe(false); // clipped
  });

  it("leaves a frame with no neutral surface alone instead of tinting it", () => {
    // Warm wooden table filling the frame with a saturated blue item in the middle.
    const data = frame(120, 80, (x, y) => (x > 40 && x < 80 && y > 20 && y < 60 ? [40, 70, 180] : [190, 140, 95]));
    const wb = estimateWhiteBalance(data, 120, 80, 3, { stride: 1 });
    expect(wb.applied).toBe(false);
    expect(wb.gains).toEqual([1, 1, 1]);
    expect(wb.neutralFraction).toBe(0);
  });

  it("neutralises a warm cast using the paper in the scene, not the table", () => {
    // Left half: warm table. Right half: white paper photographed under a warm lamp.
    const data = frame(120, 80, (x) => (x < 60 ? [190, 140, 95] : [236, 224, 206]));
    const wb = estimateWhiteBalance(data, 120, 80, 3, { stride: 1 });
    expect(wb.applied).toBe(true);
    expect(wb.neutralFraction).toBeCloseTo(0.5, 2);
    const [gr, gg, gb] = wb.gains;
    // Red is pulled down, blue pushed up, and green stays close to unity.
    expect(gr).toBeLessThan(1);
    expect(gb).toBeGreaterThan(1);
    expect(Math.abs(gg - 1)).toBeLessThan(0.02);
    // Applying the gains brings the paper close to neutral.
    const paper = [236 * gr, 224 * gg, 206 * gb];
    expect(Math.max(...paper) - Math.min(...paper)).toBeLessThan(12);
  });

  it("clamps the correction so a strong cast is softened, never over-corrected", () => {
    const data = frame(60, 60, () => [240, 222, 204]);
    const wb = estimateWhiteBalance(data, 60, 60, 3, { stride: 1, maxGain: 0.06 });
    expect(wb.applied).toBe(true);
    for (const g of wb.gains) {
      expect(g).toBeGreaterThanOrEqual(0.94);
      expect(g).toBeLessThanOrEqual(1.06);
    }
  });

  it("ignores a sliver of neutral pixels below the minimum share", () => {
    const data = frame(100, 100, (x, y) => (x === 0 && y === 0 ? [230, 230, 230] : [190, 140, 95]));
    const wb = estimateWhiteBalance(data, 100, 100, 3, { stride: 1, minNeutralFraction: 0.01 });
    expect(wb.applied).toBe(false);
  });
});
