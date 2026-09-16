import { describe, expect, it } from "vitest";
import { clampStep, LAST_STEP, ONBOARDING_STEPS, resolveStep } from "@/lib/onboarding/steps";

describe("onboarding steps", () => {
  it("clamps indices into range", () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(99)).toBe(LAST_STEP);
    expect(clampStep("2")).toBe(2);
    expect(clampStep("nope")).toBe(0);
    expect(clampStep(undefined)).toBe(0);
    expect(clampStep(2.9)).toBe(2);
  });

  it("resolves ?step= by slug or index, falling back to the persisted step", () => {
    expect(resolveStep(undefined, 4)).toBe(4);
    expect(resolveStep("", 4)).toBe(4);
    expect(resolveStep("connect", 0)).toBe(ONBOARDING_STEPS.findIndex((s) => s.slug === "connect"));
    expect(resolveStep(["pricing", "welcome"], 0)).toBe(5);
    expect(resolveStep("6", 0)).toBe(6);
    expect(resolveStep("42", 1)).toBe(LAST_STEP);
    expect(resolveStep("garbage", 3)).toBe(0);
  });

  it("has eight unique slugs", () => {
    expect(ONBOARDING_STEPS).toHaveLength(8);
    expect(new Set(ONBOARDING_STEPS.map((s) => s.slug)).size).toBe(8);
  });
});
