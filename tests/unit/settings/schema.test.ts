import { describe, expect, it } from "vitest";
import { OnboardingPutSchema } from "@/lib/onboarding/state";
import { changedKeys, PreferencesPatchSchema, SettingsPutSchema } from "@/lib/settings/schema";
import { describeUserAgent } from "@/lib/settings/sessions";

describe("PreferencesPatchSchema", () => {
  it("accepts a partial patch and normalises codes", () => {
    const r = PreferencesPatchSchema.parse({ country: "us", currency: "usd", city: "  Portland " });
    expect(r).toEqual({ country: "US", currency: "USD", city: "Portland" });
  });

  it("rejects unknown keys and onboarding fields", () => {
    expect(PreferencesPatchSchema.safeParse({ onboardingComplete: true }).success).toBe(false);
    expect(PreferencesPatchSchema.safeParse({ userId: "x" }).success).toBe(false);
  });

  it("refuses turning off both shipping and pickup in one patch", () => {
    const r = PreferencesPatchSchema.safeParse({ offersShipping: false, offersLocalPickup: false });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate marketplaces and unknown ones", () => {
    expect(PreferencesPatchSchema.safeParse({ defaultMarketplaces: ["EBAY", "EBAY"] }).success).toBe(false);
    expect(PreferencesPatchSchema.safeParse({ defaultMarketplaces: ["ETSY"] }).success).toBe(false);
    expect(PreferencesPatchSchema.safeParse({ defaultMarketplaces: [] }).success).toBe(true);
  });

  it("validates enums", () => {
    expect(PreferencesPatchSchema.safeParse({ theme: "DARK", pricingStrategy: "MAX_VALUE" }).success).toBe(true);
    expect(PreferencesPatchSchema.safeParse({ theme: "BLUE" }).success).toBe(false);
  });
});

describe("SettingsPutSchema", () => {
  it("needs at least one of profile or preferences", () => {
    expect(SettingsPutSchema.safeParse({}).success).toBe(false);
    expect(SettingsPutSchema.safeParse({ profile: { name: "  " } }).success).toBe(false);
    expect(SettingsPutSchema.safeParse({ profile: { name: "Sam" } }).success).toBe(true);
  });
});

describe("OnboardingPutSchema", () => {
  it("requires something to update and bounds the step", () => {
    expect(OnboardingPutSchema.safeParse({}).success).toBe(false);
    expect(OnboardingPutSchema.safeParse({ step: 7 }).success).toBe(true);
    expect(OnboardingPutSchema.safeParse({ step: 8 }).success).toBe(false);
    expect(OnboardingPutSchema.safeParse({ complete: true, prefs: { city: "Austin" } }).success).toBe(true);
  });
});

describe("helpers", () => {
  it("changedKeys ignores undefined", () => {
    expect(changedKeys({ a: 1, b: undefined, c: null })).toEqual(["a", "c"]);
  });

  it("describes user agents in plain words", () => {
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36")).toBe("Chrome on macOS");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone");
    expect(describeUserAgent("curl/8.5.0")).toBe("curl");
    expect(describeUserAgent(null)).toBe("Unknown device");
  });
});
