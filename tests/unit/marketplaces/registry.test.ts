import { describe, expect, it } from "vitest";
import { estimateFees, fitDescription, fitTitle, isMarketplaceId, netProceeds } from "@/lib/marketplaces/registry";

describe("registry fees", () => {
  it("applies each marketplace's published structure", () => {
    expect(estimateFees("EBAY", 10000)).toBe(1360 + 40);
    expect(estimateFees("FACEBOOK", 500)).toBe(80); // $0.80 minimum on shipped checkout
    expect(estimateFees("FACEBOOK", 500, { local: true })).toBe(0);
    expect(estimateFees("POSHMARK", 1000)).toBe(295);
    expect(estimateFees("POSHMARK", 5000)).toBe(1000);
    expect(estimateFees("NEXTDOOR", 5000)).toBe(0);
  });

  it("nets out shipping cost unless the sale is local", () => {
    expect(netProceeds("EBAY", 10000, { shippingCostCents: 800 }).net).toBe(10000 - 1400 - 800);
    expect(netProceeds("EBAY", 10000, { shippingCostCents: 800, local: true }).net).toBe(10000 - 1400);
  });
});

describe("title and description fitting", () => {
  it("cuts titles at a word boundary and trims trailing punctuation", () => {
    expect(fitTitle("Apple iPhone 13 Pro Max 256GB Graphite Unlocked, Excellent Condition", 50)).toBe("Apple iPhone 13 Pro Max 256GB Graphite Unlocked");
    expect(fitTitle("short", 80)).toBe("short");
  });

  it("prefers paragraph or sentence breaks and appends an ellipsis", () => {
    const text = `${"A".repeat(60)}. ${"B".repeat(60)}. ${"C".repeat(60)}.`;
    const fitted = fitDescription(text, 140);
    expect(fitted.length).toBeLessThanOrEqual(140);
    expect(fitted.endsWith("…")).toBe(true);
  });

  it("guards marketplace ids", () => {
    expect(isMarketplaceId("EBAY")).toBe(true);
    expect(isMarketplaceId("ebay")).toBe(false);
    expect(isMarketplaceId("__proto__")).toBe(false);
  });
});
