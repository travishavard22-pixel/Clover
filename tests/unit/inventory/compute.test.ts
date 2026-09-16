import { describe, expect, it } from "vitest";
import { applyReprice, computeMetrics, daysBetween, daysOnMarket, estimatedProfit, histogramDays, realisedProfit, type MetricItemRow } from "@/lib/inventory/compute";

const NOW = new Date("2026-09-16T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function item(partial: Partial<MetricItemRow> & { id: string }): MetricItemRow {
  return {
    status: "DRAFT",
    createdAt: daysAgo(10),
    listedAt: null,
    soldAt: null,
    soldPrice: null,
    soldMarketplace: null,
    fees: null,
    shippingCost: null,
    acquisitionCost: null,
    estimatedValue: null,
    listPrice: null,
    ...partial,
  };
}

describe("days and profit", () => {
  it("counts whole days, never negative", () => {
    expect(daysBetween(daysAgo(3), NOW)).toBe(3);
    expect(daysBetween(NOW, daysAgo(3))).toBe(0);
    expect(daysBetween(new Date(NOW.getTime() - 86_400_000 * 2.9), NOW)).toBe(2);
  });
  it("days on market stops at the sale for sold items and runs to now otherwise", () => {
    expect(daysOnMarket({ listedAt: daysAgo(20), soldAt: daysAgo(5), status: "SOLD" }, NOW)).toBe(15);
    expect(daysOnMarket({ listedAt: daysAgo(20), soldAt: null, status: "LISTED" }, NOW)).toBe(20);
    expect(daysOnMarket({ listedAt: null, soldAt: null, status: "READY" }, NOW)).toBeNull();
  });
  it("realised profit nets fees, shipping and cost; estimated profit only for unsold items", () => {
    const sold = { status: "SOLD" as const, soldPrice: 24_500, fees: 3_372, shippingCost: 1_200, acquisitionCost: 6_000, estimatedValue: 25_000, listPrice: 26_900 };
    expect(realisedProfit(sold)).toBe(24_500 - 3_372 - 1_200 - 6_000);
    expect(estimatedProfit(sold)).toBeNull();
    const listed = { ...sold, status: "LISTED" as const, soldPrice: null };
    expect(realisedProfit(listed)).toBeNull();
    expect(estimatedProfit(listed)).toBe(25_000 - 6_000);
    expect(estimatedProfit({ ...listed, estimatedValue: null })).toBe(26_900 - 6_000);
    expect(estimatedProfit({ ...listed, estimatedValue: null, listPrice: null })).toBeNull();
  });
});

describe("batch reprice", () => {
  it("applies a percentage and snaps to marketplace price points", () => {
    // 10% off $65 = $58.50 → rounds to $58.99 (under $50? no) → whole-dollar band under $200 → $59
    expect(applyReprice(6_500, null, { mode: "percent", percent: -10 })).toBe(5_900);
    // 20% off $40 = $32 → $x.99 band → $31.99
    expect(applyReprice(4_000, null, { mode: "percent", percent: -20 })).toBe(3_199);
    // Above $200 snaps to $5 steps
    expect(applyReprice(31_200, null, { mode: "percent", percent: 5 })).toBe(33_000);
  });
  it("can skip rounding", () => {
    expect(applyReprice(6_500, null, { mode: "percent", percent: -10, round: false })).toBe(5_850);
  });
  it("never drops below the floor price or $1", () => {
    expect(applyReprice(6_500, 6_000, { mode: "percent", percent: -50 })).toBe(6_000);
    expect(applyReprice(6_500, null, { mode: "absolute", cents: 20 })).toBe(100);
    expect(applyReprice(6_500, 7_000, { mode: "absolute", cents: 5_000 })).toBe(7_000);
  });
  it("returns null when there is no list price to adjust in percent mode", () => {
    expect(applyReprice(null, null, { mode: "percent", percent: -10 })).toBeNull();
    expect(applyReprice(null, null, { mode: "absolute", cents: 1_500 })).toBe(1_500);
  });
});

describe("computeMetrics", () => {
  const items: MetricItemRow[] = [
    item({ id: "a", status: "LISTED", listedAt: daysAgo(20), listPrice: 18_900, estimatedValue: 17_500, acquisitionCost: 4_000, createdAt: daysAgo(21) }),
    item({ id: "b", status: "OFFER_RECEIVED", listedAt: daysAgo(5), listPrice: 6_500, estimatedValue: 6_000, createdAt: daysAgo(6) }),
    item({ id: "c", status: "SOLD", listedAt: daysAgo(25), soldAt: daysAgo(12), soldPrice: 24_500, fees: 3_372, shippingCost: 1_200, acquisitionCost: 6_000, soldMarketplace: "EBAY", createdAt: daysAgo(26) }),
    item({ id: "d", status: "COMPLETED", listedAt: daysAgo(80), soldAt: daysAgo(70), soldPrice: 26_500, fees: 3_644, acquisitionCost: 20_000, soldMarketplace: "EBAY", createdAt: daysAgo(85) }),
    item({ id: "e", status: "SHIPPED", listedAt: daysAgo(8), soldAt: daysAgo(3), soldPrice: 28_900, fees: 3_970, acquisitionCost: 25_000, soldMarketplace: "EBAY", createdAt: daysAgo(9) }),
    item({ id: "f", status: "SOLD", listedAt: daysAgo(50), soldAt: daysAgo(40), soldPrice: 5_500, fees: 0, acquisitionCost: 1_200, soldMarketplace: "FACEBOOK", createdAt: daysAgo(55) }),
    item({ id: "g", status: "DRAFT", createdAt: daysAgo(1) }),
    item({ id: "h", status: "READY", estimatedValue: 9_500, createdAt: daysAgo(2) }),
    item({ id: "i", status: "ARCHIVED", listPrice: 3_000, estimatedValue: 3_000, createdAt: daysAgo(30) }),
    item({ id: "j", status: "LISTED", listedAt: daysAgo(30), listPrice: 4_000, createdAt: daysAgo(31) }),
  ];
  const publications = [
    { itemId: "a", marketplace: "EBAY" as const, status: "PUBLISHED" },
    { itemId: "a", marketplace: "FACEBOOK" as const, status: "PUBLISHED" },
    { itemId: "b", marketplace: "EBAY" as const, status: "PUBLISHED" },
    { itemId: "c", marketplace: "EBAY" as const, status: "SOLD" },
    { itemId: "j", marketplace: "FACEBOOK" as const, status: "PUBLISHED" },
    { itemId: "i", marketplace: "EBAY" as const, status: "ENDED" },
  ];
  const m = computeMetrics(items, publications, { now: NOW, itemsWithOffers: new Set(["b", "j"]) });

  it("counts listings, sales and revenue in the right windows", () => {
    expect(m.activeListings).toBe(3); // a, b, j
    expect(m.soldAll).toBe(4);
    expect(m.sold30d).toBe(2); // c (12d), e (3d)
    expect(m.revenue30d).toBe(24_500 + 28_900);
    expect(m.revenueAll).toBe(24_500 + 26_500 + 28_900 + 5_500);
    expect(m.deltas.sold30d).toBe(2 - 1); // f sold 40 days ago is in the previous window
    expect(m.deltas.revenue30d).toBe(24_500 + 28_900 - 5_500);
  });
  it("estimates inventory value only for unsold, non-archived items (estimate first, list price fallback)", () => {
    expect(m.inventoryValueEstimate).toBe(17_500 + 6_000 + 9_500 + 4_000);
  });
  it("realised profit sums sold items", () => {
    const c = 24_500 - 3_372 - 1_200 - 6_000;
    const d = 26_500 - 3_644 - 20_000;
    const e = 28_900 - 3_970 - 25_000;
    const f = 5_500 - 1_200;
    expect(m.realisedProfit).toBe(c + d + e + f);
    expect(m.realisedProfit30d).toBe(c + e);
  });
  it("computes days to sale", () => {
    expect(m.daysToSale).toEqual([5, 10, 10, 13]);
    expect(m.avgDaysToSale).toBe(9.5);
    expect(m.medianDaysToSale).toBe(10);
  });
  it("ranks marketplaces by revenue and sell-through", () => {
    expect(m.bestByRevenue?.marketplace).toBe("EBAY");
    expect(m.bestByRevenue?.revenue).toBe(24_500 + 26_500 + 28_900);
    const fb = m.marketplaces.find((x) => x.marketplace === "FACEBOOK")!;
    expect(fb.sold).toBe(1);
    expect(fb.active).toBe(2); // a + j
    expect(fb.sellThrough).toBeCloseTo(1 / 3, 3);
    const ebay = m.marketplaces.find((x) => x.marketplace === "EBAY")!;
    expect(ebay.active).toBe(2); // a + b (c is SOLD, i ENDED)
    expect(ebay.sellThrough).toBeCloseTo(3 / 5, 3);
    expect(m.bestBySellThrough?.marketplace).toBe("EBAY");
  });
  it("flags stale listings (LISTED > 14 days, never had an offer)", () => {
    expect(m.shouldReprice).toBe(1); // a; j is 30 days but had an offer, b is fresh
  });
  it("produces a 90-day series with sales on the right days", () => {
    expect(m.series).toHaveLength(90);
    expect(m.series[89]!.date).toBe("2026-09-16");
    const soldDays = m.series.filter((p) => p.sold > 0);
    expect(soldDays.map((p) => p.date)).toEqual(["2026-07-08", "2026-08-07", "2026-09-04", "2026-09-13"]);
    expect(m.series.reduce((s, p) => s + p.revenue, 0)).toBe(m.revenueAll);
    expect(m.series.reduce((s, p) => s + p.listed, 0)).toBe(items.filter((i) => i.createdAt >= daysAgo(89)).length);
  });
  it("breaks down status in a fixed order", () => {
    expect(m.statusBreakdown.map((s) => s.status)).toEqual(["DRAFT", "ANALYZING", "READY", "LISTED", "OFFER_RECEIVED", "SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"]);
    expect(m.statusBreakdown.find((s) => s.status === "LISTED")?.count).toBe(2);
    expect(m.drafts).toBe(1);
    expect(m.ready).toBe(1);
  });
  it("handles an empty inventory", () => {
    const empty = computeMetrics([], [], { now: NOW });
    expect(empty.avgDaysToSale).toBeNull();
    expect(empty.bestByRevenue).toBeNull();
    expect(empty.deltas).toEqual({ sold30d: null, revenue30d: null });
    expect(empty.series).toHaveLength(90);
  });
});

describe("histogramDays", () => {
  it("buckets days to sale", () => {
    expect(histogramDays([0, 3, 4, 7, 8, 14, 15, 30, 31, 60, 61, 200]).map((b) => b.count)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(histogramDays([]).every((b) => b.count === 0)).toBe(true);
  });
});
