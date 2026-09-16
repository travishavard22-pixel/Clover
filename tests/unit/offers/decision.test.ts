import { describe, expect, it } from "vitest";
import { effectiveFloor, offerMath, ruleBasedAdvice, validateCounter } from "@/lib/offers/decision";

describe("offerMath", () => {
  it("computes the gap, fees, net and profit for an eBay offer", () => {
    const m = offerMath({ amountCents: 8000, originalPriceCents: 10000, marketplace: "EBAY", acquisitionCostCents: 2500 });
    expect(m.differenceCents).toBe(-2000);
    expect(m.differencePct).toBe(-20);
    // 13.6% + $0.40
    expect(m.feesCents).toBe(Math.round(8000 * 0.136) + 40);
    expect(m.netCents).toBe(8000 - m.feesCents);
    expect(m.estimatedProfitCents).toBe(m.netCents - 2500);
  });

  it("returns null profit when the acquisition cost is unknown and 0% when asking is 0", () => {
    const m = offerMath({ amountCents: 5000, originalPriceCents: 0, marketplace: "FACEBOOK", acquisitionCostCents: null, local: true });
    expect(m.estimatedProfitCents).toBeNull();
    expect(m.differencePct).toBe(0);
    expect(m.feesCents).toBe(0); // local pickup on Facebook is free
  });

  it("rounds the percentage to one decimal", () => {
    const m = offerMath({ amountCents: 8150, originalPriceCents: 10000, marketplace: "NEXTDOOR", acquisitionCostCents: null });
    expect(m.differencePct).toBe(-18.5);
  });
});

describe("effectiveFloor", () => {
  it("prefers the seller's floor, then the quick-sale estimate capped at asking, then 80% of asking", () => {
    expect(effectiveFloor({ floorPriceCents: 7000, estimate: { quickSale: 6000, recommended: 9000, maxValue: 11000 }, listPriceCents: 10000 })).toBe(7000);
    expect(effectiveFloor({ floorPriceCents: null, estimate: { quickSale: 12000, recommended: 9000, maxValue: 11000 }, listPriceCents: 10000 })).toBe(10000);
    expect(effectiveFloor({ floorPriceCents: null, estimate: null, listPriceCents: 10000 })).toBe(8000);
  });
});

describe("ruleBasedAdvice", () => {
  const base = { listPriceCents: 10000, floorPriceCents: 7000, estimate: null, daysListed: 3, marketplace: "EBAY" as const };

  it("accepts an offer within 3% of asking", () => {
    const a = ruleBasedAdvice({ ...base, offerCents: 9750 });
    expect(a.recommendation).toBe("accept");
    expect(a.counterAmountCents).toBeNull();
    expect(a.reasoning).toContain("within 3%");
  });

  it("accepts at or above the floor once the listing is three weeks old", () => {
    expect(ruleBasedAdvice({ ...base, offerCents: 7200, daysListed: 25 }).recommendation).toBe("accept");
    expect(ruleBasedAdvice({ ...base, offerCents: 7200, daysListed: 5 }).recommendation).toBe("counter");
  });

  it("counters between the offer and asking, never below the floor or above asking", () => {
    const a = ruleBasedAdvice({ ...base, offerCents: 6500 });
    expect(a.recommendation).toBe("counter");
    expect(a.counterAmountCents).not.toBeNull();
    expect(a.counterAmountCents!).toBeGreaterThan(6500);
    expect(a.counterAmountCents!).toBeGreaterThanOrEqual(7000);
    expect(a.counterAmountCents!).toBeLessThanOrEqual(10000);
    expect(validateCounter(a.counterAmountCents!, 6500, 10000)).toBeNull();
  });

  it("declines an offer more than 15% below the floor", () => {
    const a = ruleBasedAdvice({ ...base, offerCents: 5000 });
    expect(a.recommendation).toBe("decline");
    expect(a.suggestedMessage).toContain("$70");
  });

  it("always names itself as the rules source", () => {
    expect(ruleBasedAdvice({ ...base, offerCents: 9000 }).source).toBe("rules");
  });
});

describe("validateCounter", () => {
  it("requires a positive integer above the offer and at most the asking price", () => {
    expect(validateCounter(0, 5000, 10000)).toMatch(/Enter/);
    expect(validateCounter(50.5, 5000, 10000)).toMatch(/Enter/);
    expect(validateCounter(5000, 5000, 10000)).toMatch(/higher than the buyer/);
    expect(validateCounter(10001, 5000, 10000)).toMatch(/cannot be higher than your asking/);
    expect(validateCounter(7500, 5000, 10000)).toBeNull();
    expect(validateCounter(7500, 5000, 0)).toBeNull(); // unknown asking price: only the lower bound applies
  });
});
