import { describe, expect, it } from "vitest";
import { CLOVER_LEAF_ANGLES, CLOVER_LEAF_OFFSET, CLOVER_LUCKY_LEAF, CLOVER_SCALE, cloverLeafTransform, cloverLeaves, cloverReach } from "@/components/brand/clover";

describe("clover geometry", () => {
  it("places four leaves on the axes", () => {
    // Not the diagonals: there the lobes overlap into a blob instead of reading as four leaves.
    expect([...CLOVER_LEAF_ANGLES]).toEqual([0, 90, 180, 270]);
  });

  it("puts every leaf's tip at the centre of the tile", () => {
    // The transform ends by moving the heart's tip (12,22) to the tile centre; if that drifts, the
    // leaves separate and the mark stops being a clover.
    for (const angle of CLOVER_LEAF_ANGLES) {
      expect(cloverLeafTransform(angle, 1.38, 64)).toContain("translate(32 32)");
      expect(cloverLeafTransform(angle, 1.38, 64)).toContain("translate(-12 -22)");
    }
  });

  it("styles exactly one leaf as the lucky one", () => {
    const markup = cloverLeaves(CLOVER_SCALE.tile, 64, { attrs: 'fill="#c1eacb"' });
    expect(markup.match(/<path/g)).toHaveLength(4);
    expect(markup.match(/#c1eacb/g)).toHaveLength(1);
    // The top leaf. An off-axis lucky leaf reads as accidental rather than chosen.
    expect(CLOVER_LUCKY_LEAF).toBe(0);
    expect(markup.indexOf("#c1eacb")).toBeLessThan(markup.indexOf("rotate(90)"));
  });

  it("leaves the mark unstyled when no lucky fill is given", () => {
    // The in-app mark takes currentColor, so it must not carry a hardcoded fill.
    const markup = cloverLeaves(CLOVER_SCALE.tile);
    expect(markup).not.toContain("fill=");
    expect(markup.match(/<path/g)).toHaveLength(4);
  });

  it("keeps the maskable mark inside Android's safe circle", () => {
    // Android may crop a maskable icon to a circle of 80% diameter — a radius of 25.6 on a 64 tile.
    // The offset counts towards the reach, so it is checked through cloverReach rather than scale.
    expect(cloverReach(CLOVER_SCALE.maskable)).toBeLessThan(0.8 * 32);
    // And the store tile should fill its square generously, without running off the edge.
    expect(cloverReach(CLOVER_SCALE.tile)).toBeGreaterThan(24);
    expect(cloverReach(CLOVER_SCALE.tile)).toBeLessThan(32);
  });

  it("pushes the leaves apart so four of them are countable", () => {
    // With the tips meeting exactly at the centre the leaves merge into one silhouette and the mark
    // reads as a flower. The offset is what opens the clefts; zero would undo the whole point.
    expect(CLOVER_LEAF_OFFSET).toBeGreaterThan(0);
    for (const angle of CLOVER_LEAF_ANGLES) {
      expect(cloverLeafTransform(angle, CLOVER_SCALE.tile)).toContain(`translate(0 ${-CLOVER_LEAF_OFFSET})`);
    }
  });
});
