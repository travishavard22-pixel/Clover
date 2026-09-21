import { describe, expect, it } from "vitest";
import { decideOffer, evaluateOfferAutopilot } from "@/lib/automations/evaluators/offer-autopilot";
import { offerIdOfKey } from "@/lib/automations/dedupe";
import { AUTOMATIONS } from "@/lib/automations/registry";
import type { OfferAutopilotConfig, SnapshotItem, SnapshotOffer } from "@/lib/automations/types";
import { evaluationContext, snapshotItem, snapshotOffer } from "../../support/snapshot";

const RULE = AUTOMATIONS.OFFER_AUTOPILOT.defaultConfig as OfferAutopilotConfig;
const config = (over: Partial<OfferAutopilotConfig> = {}): OfferAutopilotConfig => ({ ...RULE, ...over });

describe("decideOffer", () => {
  it("accepts at or above the configured percentage of the asking price", () => {
    // 95% of $100 is $95: the boundary itself accepts.
    expect(decideOffer({ offerCents: 9500, askCents: 10_000, floorCents: null }, config())).toMatchObject({ response: "accept" });
    expect(decideOffer({ offerCents: 9499, askCents: 10_000, floorCents: null }, config()).response).not.toBe("accept");
  });

  it("never accepts below the floor, however generous the percentage", () => {
    // 50% of the ask would accept almost anything — the floor still wins.
    const d = decideOffer({ offerCents: 6000, askCents: 10_000, floorCents: 8000 }, config({ acceptAtOrAbovePercent: 50 }));
    expect(d.response).toBe("decline");
    expect(d.reason).toContain("floor");
  });

  it("counters instead of declining when the seller turned declining off", () => {
    // The switch decides how a lowball is answered, not whether the floor holds: the counter is
    // raised to the floor either way.
    const input = { offerCents: 4000, askCents: 10_000, floorCents: 8000 };
    expect(decideOffer(input, config()).response).toBe("decline");
    expect(decideOffer(input, config({ declineBelowFloor: false }))).toMatchObject({ response: "counter", counterCents: 9000 });
  });

  it("leaves anything over the auto-accept ceiling for a person", () => {
    // The guard is against a mistyped asking price, so it is a ceiling on unattended acceptance,
    // not a judgement about the offer: a great offer over the ceiling is proposed, never taken.
    const d = decideOffer({ offerCents: 150_000, askCents: 150_000, floorCents: null }, config({ maxAutoAcceptCents: 100_000 }));
    expect(d.response).toBeNull();
    expect(d.reason).toContain("ceiling");
    expect(decideOffer({ offerCents: 150_000, askCents: 150_000, floorCents: null }, config({ maxAutoAcceptCents: 0 })).response).toBe("accept");
  });

  it("counters between the floor and the ask", () => {
    const d = decideOffer({ offerCents: 7000, askCents: 10_000, floorCents: null }, config());
    expect(d).toMatchObject({ response: "counter", counterCents: 9000 });
  });

  it("never counters below the floor or above the ask", () => {
    // With below-floor declining switched off, a lowball falls through to a counter — which the
    // floor still raises: 90% of the ask would be $90, under the $95 floor.
    expect(decideOffer({ offerCents: 7000, askCents: 10_000, floorCents: 9500 }, config({ declineBelowFloor: false })).counterCents).toBe(9500);
    expect(decideOffer({ offerCents: 8000, askCents: 10_000, floorCents: null }, config({ counterPercent: 150 })).counterCents).toBe(10_000);
  });

  it("proposes nothing when a counter would not beat the offer", () => {
    // 90% of $100 is $90, which is under their $92 — countering lower than they offered is absurd.
    const d = decideOffer({ offerCents: 9200, askCents: 10_000, floorCents: null }, config({ acceptAtOrAbovePercent: 99 }));
    expect(d.response).toBeNull();
    expect(d.reason).toContain("would not be above");
  });

  it("does nothing without an asking price to compare against", () => {
    expect(decideOffer({ offerCents: 5000, askCents: 0, floorCents: null }, config()).response).toBeNull();
  });
});

// ───────────────────────────── The evaluator ─────────────────────────────

const OFFER = snapshotOffer();
const item = (over: Partial<SnapshotItem> = {}, offers: SnapshotOffer[] = [OFFER]) => snapshotItem({ status: "LISTED", offers, ...over });
const ctx = (items: SnapshotItem[]) => evaluationContext(items);

describe("evaluateOfferAutopilot", () => {
  it("proposes one executable reply per pending offer on an API listing", () => {
    const [p, ...rest] = evaluateOfferAutopilot(ctx([item()]), config());
    expect(rest).toHaveLength(0);
    expect(p!.autoExecutable).toBe(true);
    expect(p!.proposal).toMatchObject({ action: "respond_offer", offerId: "off-1", response: "accept", offerCents: 9600, askCents: 10_000 });
    expect(offerIdOfKey(p!.proposal.key)).toBe("off-1");
  });

  it("will not execute on an assisted listing, and says why", () => {
    const [p] = evaluateOfferAutopilot(ctx([item({}, [{ ...OFFER, publicationMode: "ASSISTED" }])]), config());
    expect(p!.autoExecutable).toBe(false);
    expect(p!.autoBlockedReason).toContain("no API");
  });

  it("ignores offers that are no longer pending and items that already sold", () => {
    expect(evaluateOfferAutopilot(ctx([item({}, [{ ...OFFER, status: "DECLINED" }])]), config())).toEqual([]);
    expect(evaluateOfferAutopilot(ctx([item({ status: "SOLD" })]), config())).toEqual([]);
  });

  it("falls back to the item's list price when the offer carries no asking price", () => {
    const [p] = evaluateOfferAutopilot(ctx([item({ listPrice: 10_000 }, [{ ...OFFER, originalPrice: 0 }])]), config());
    expect(p!.proposal).toMatchObject({ askCents: 10_000, response: "accept" });
  });
});
