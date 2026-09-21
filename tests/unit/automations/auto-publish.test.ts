import { describe, expect, it } from "vitest";
import { evaluateAutoPublish, publishReadiness, publishableMarketplaces } from "@/lib/automations/evaluators/auto-publish";
import { AUTOMATIONS } from "@/lib/automations/registry";
import type { AutoPublishConfig, EvaluationContext, SnapshotItem } from "@/lib/automations/types";
import { evaluationContext, snapshotItem } from "../../support/snapshot";

const RULE = AUTOMATIONS.AUTO_PUBLISH.defaultConfig as AutoPublishConfig;
const config = (over: Partial<AutoPublishConfig> = {}): AutoPublishConfig => ({ ...RULE, ...over });

const photo = (id: string) => ({ id, kind: "ORIGINAL" as const, width: 2000, height: 1500, sortOrder: 0, aiGenerated: false, studioMode: null });

/** An item that passes every default check, so each test can break exactly one thing. */
function ready(over: Partial<SnapshotItem> = {}): SnapshotItem {
  return snapshotItem({
    status: "READY",
    listPrice: 10_000,
    floorPrice: 8000,
    photos: [photo("p1"), photo("p2"), photo("p3")],
    profile: { itemName: "Leica M6", identityConfidence: 0.92, brand: "Leica", model: "M6", dimensions: null, material: null },
    estimate: { quickSale: 8500, recommended: 10_000, maxValue: 12_000, confidence: "CONFIDENT", basis: "MARKET_EVIDENCE" },
    drafts: [{ id: "d1", marketplace: null, title: "Leica M6", selfCheckVerdict: "pass", updatedAt: "2026-09-20T00:00:00.000Z" }],
    ...over,
  });
}

const blockerCodes = (item: SnapshotItem, cfg = config(), ctx: EvaluationContext = evaluationContext([item])) => publishReadiness(ctx, item, cfg).blockers.map((b) => b.code);

describe("publishReadiness", () => {
  it("passes an item where nothing needs a person, and says why", () => {
    const r = publishReadiness(evaluationContext([ready()]), ready(), config());
    expect(r.ready).toBe(true);
    expect(r.marketplaces).toEqual(["EBAY", "FACEBOOK"]);
    expect(r.reasons.join(" ")).toContain("92% confidence");
    expect(r.reasons.join(" ")).toContain("comparable listings");
  });

  it("stops on an item that is not waiting to be listed", () => {
    expect(blockerCodes(ready({ status: "LISTED" }))).toEqual(["status"]);
    expect(blockerCodes(ready({ status: "ANALYZING" }))).toEqual(["status"]);
  });

  it("stops on a shaky identification", () => {
    expect(blockerCodes(ready({ profile: { itemName: "Camera", identityConfidence: 0.6, brand: null, model: null, dimensions: null, material: null } }))).toContain("identity");
    expect(blockerCodes(ready({ profile: null }))).toContain("identity");
  });

  it("stops on a price that came from a guess rather than comparables", () => {
    const guessed = ready({ estimate: { quickSale: 8500, recommended: 10_000, maxValue: 12_000, confidence: "LIKELY", basis: "AI_ESTIMATE" } });
    expect(blockerCodes(guessed)).toContain("evidence");
    // The seller can accept guesses, and then nothing else about the item has changed.
    expect(publishReadiness(evaluationContext([guessed]), guessed, config({ requireMarketEvidence: false })).ready).toBe(true);
  });

  it("stops when the listing copy makes a claim the identification does not support", () => {
    expect(blockerCodes(ready({ drafts: [{ id: "d1", marketplace: null, title: "t", selfCheckVerdict: "revise", updatedAt: "2026-09-20T00:00:00.000Z" }] }))).toContain("self_check");
    expect(blockerCodes(ready({ drafts: [] }))).toContain("self_check");
  });

  it("stops on too few photos, no price, or no floor", () => {
    expect(blockerCodes(ready({ photos: [photo("p1")] }))).toContain("photos");
    expect(blockerCodes(ready({ listPrice: null }))).toContain("price");
    expect(blockerCodes(ready({ floorPrice: null }))).toContain("floor");
    expect(blockerCodes(ready({ floorPrice: null }), config({ requireFloorPrice: false }))).not.toContain("floor");
  });

  it("reports every blocker at once rather than the first", () => {
    const codes = blockerCodes(ready({ photos: [], floorPrice: null, profile: null }));
    expect(codes).toEqual(expect.arrayContaining(["identity", "photos", "floor"]));
  });

  it("gives no reasons when it is not ready", () => {
    expect(publishReadiness(evaluationContext([ready()]), ready({ photos: [] }), config()).reasons).toEqual([]);
  });
});

describe("publishableMarketplaces", () => {
  it("skips an API marketplace with no connection, and keeps assisted ones", () => {
    const ctx = evaluationContext([ready()], { connections: [] });
    expect(publishableMarketplaces(ctx, ready())).toEqual(["FACEBOOK"]);
  });

  it("skips an API marketplace whose connection is broken", () => {
    const ctx = evaluationContext([ready()], { connections: [{ marketplace: "EBAY", status: "NEEDS_RECONNECT", mode: "api" }] });
    expect(publishableMarketplaces(ctx, ready())).toEqual(["FACEBOOK"]);
  });

  it("skips a marketplace the item is already on", () => {
    const item = ready({ publications: [{ id: "pub1", marketplace: "EBAY", mode: "API", status: "PUBLISHED", price: 10_000, externalUrl: null, attentionCode: null, publishedAt: null, updatedAt: "2026-09-20T00:00:00.000Z" }] });
    expect(publishableMarketplaces(evaluationContext([item]), item)).toEqual(["FACEBOOK"]);
  });

  it("re-offers a marketplace whose listing ended", () => {
    const item = ready({ publications: [{ id: "pub1", marketplace: "EBAY", mode: "API", status: "ENDED", price: 10_000, externalUrl: null, attentionCode: null, publishedAt: null, updatedAt: "2026-09-20T00:00:00.000Z" }] });
    expect(publishableMarketplaces(evaluationContext([item]), item)).toContain("EBAY");
  });

  it("blocks the whole proposal when there is nowhere left to publish", () => {
    const item = ready({ publications: [{ id: "pub1", marketplace: "FACEBOOK", mode: "ASSISTED", status: "REQUIRES_USER_ACTION", price: 10_000, externalUrl: null, attentionCode: null, publishedAt: null, updatedAt: "2026-09-20T00:00:00.000Z" }] });
    const ctx = evaluationContext([item], { connections: [] });
    expect(publishReadiness(ctx, item, config()).blockers.map((b) => b.code)).toEqual(["already"]);
  });
});

describe("evaluateAutoPublish", () => {
  it("proposes one publish per ready item, priced and scoped", () => {
    const [p, ...rest] = evaluateAutoPublish(evaluationContext([ready()]), config());
    expect(rest).toHaveLength(0);
    expect(p!.autoExecutable).toBe(true);
    expect(p!.notifyPreference).toBe("notifyPublishing");
    expect(p!.title).toContain("eBay and Facebook Marketplace");
    expect(p!.proposal).toMatchObject({ action: "publish", itemId: "item-1", marketplaces: ["EBAY", "FACEBOOK"], priceCents: 10_000 });
  });

  it("keys the proposal on the price, so a repriced item is a new suggestion", () => {
    const [a] = evaluateAutoPublish(evaluationContext([ready()]), config());
    const [b] = evaluateAutoPublish(evaluationContext([ready({ listPrice: 9000 })]), config());
    expect(a!.proposal.key).not.toBe(b!.proposal.key);
  });

  it("stays quiet about items that are not ready", () => {
    expect(evaluateAutoPublish(evaluationContext([ready({ status: "DRAFT" }), ready({ photos: [] })]), config())).toEqual([]);
  });
});
