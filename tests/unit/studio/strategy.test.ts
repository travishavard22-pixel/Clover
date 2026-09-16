import { describe, expect, it } from "vitest";
import { STUDIO_MODE_IDS } from "@/lib/studio/modes";
import { decideStrategy } from "@/lib/studio/strategy";

describe("render strategy", () => {
  it("never segments CONDITION or DETAIL and never QA-gates them", () => {
    for (const mode of ["CONDITION", "DETAIL"] as const) {
      const s = decideStrategy(mode, { segmentationAvailable: true, hasCachedMask: true });
      expect(s.segment).toBe("skip");
      expect(s.qa).toBe(false);
      expect(s.path).toBe(mode.toLowerCase());
      expect(s.segmentReason).toMatch(/keep the background/);
    }
  });

  it("falls back to enhancement with the configured reason when no provider is available", () => {
    const s = decideStrategy("CLEAN_STUDIO", { segmentationAvailable: false, hasCachedMask: false, unavailableReason: "No key" });
    expect(s).toMatchObject({ path: "enhance", segment: "skip", segmentReason: "No key", qa: false });
    expect(s.qaSkipReason).toMatch(/Enhancement only/);
  });

  it("reuses a cached mask before calling a provider, and runs QA on every composite", () => {
    expect(decideStrategy("LUXURY", { segmentationAvailable: false, hasCachedMask: true })).toMatchObject({ path: "composite", segment: "reuse", qa: true });
    expect(decideStrategy("LUXURY", { segmentationAvailable: true, hasCachedMask: false })).toMatchObject({ path: "composite", segment: "run", qa: true });
    for (const mode of STUDIO_MODE_IDS.filter((m) => m !== "CONDITION" && m !== "DETAIL")) {
      expect(decideStrategy(mode, { segmentationAvailable: true, hasCachedMask: false }).path).toBe("composite");
    }
  });
});
