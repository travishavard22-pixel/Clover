import { describe, expect, it } from "vitest";
import { toRecommendationDTO } from "@/lib/automations/recommendations";
import type { Recommendation } from "@/lib/db";

function rec(over: Partial<Recommendation> = {}): Recommendation & { item?: { title: string } | null } {
  return {
    id: "r1",
    userId: "u1",
    itemId: "i1",
    type: "REPRICE_STALE",
    title: "Lower the price",
    body: "No offers in 14 days.",
    proposal: { key: "reprice:i1:1", action: "reprice", itemId: "i1", fromCents: 10000, toCents: 9200, publicationIds: [], apiPublicationIds: [], reason: "stale" },
    status: "OPEN",
    snoozedUntil: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    resolvedAt: null,
    item: { title: "Leica M6" },
    ...over,
  };
}

describe("toRecommendationDTO", () => {
  it("marks change proposals as applicable and names the automation", () => {
    const d = toRecommendationDTO(rec());
    expect(d.applicable).toBe(true);
    expect(d.action).toBe("reprice");
    expect(d.typeName).toBe("Smart Repricing");
    expect(d.itemTitle).toBe("Leica M6");
    expect(d.createdAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("treats notify/review and missing proposals as informational", () => {
    expect(toRecommendationDTO(rec({ proposal: { key: "k", action: "notify", itemId: null, href: "/offers" } })).applicable).toBe(false);
    expect(toRecommendationDTO(rec({ proposal: { key: "k", action: "review", itemId: "i1", href: "/items/i1", checklist: [] } })).applicable).toBe(false);
    const none = toRecommendationDTO(rec({ proposal: null, item: null }));
    expect(none.applicable).toBe(false);
    expect(none.action).toBeNull();
    expect(none.itemTitle).toBeNull();
  });
});
