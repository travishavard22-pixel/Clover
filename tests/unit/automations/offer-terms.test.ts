import { describe, expect, it } from "vitest";
import { bestOfferTerms } from "@/lib/automations/offer-terms";
import { AUTOMATIONS } from "@/lib/automations/registry";
import type { OfferAutopilotConfig } from "@/lib/automations/types";

const RULE = AUTOMATIONS.OFFER_AUTOPILOT.defaultConfig as OfferAutopilotConfig;
const auto = (over: Partial<OfferAutopilotConfig> = {}) => ({ mode: "AUTO", config: { ...RULE, ...over } });
const listing = { priceCents: 10_000, floorPrice: 8000, conditionGrade: "GOOD" as const };

describe("bestOfferTerms", () => {
  it("turns Best Offer off on sealed items", () => {
    expect(bestOfferTerms({ ...listing, conditionGrade: "NEW_SEALED" }, auto())).toEqual({ enabled: false, autoAcceptCents: null, autoDeclineCents: null });
  });

  it("hands eBay no auto-accept price unless the seller runs the rule unattended", () => {
    for (const rule of [null, { mode: "SUGGEST", config: RULE }, { mode: "ASK", config: RULE }]) {
      const terms = bestOfferTerms(listing, rule);
      expect(terms.enabled).toBe(true);
      expect(terms.autoAcceptCents).toBeNull();
      // Still worth declining the obviously-too-low, which needs no decision from anyone.
      expect(terms.autoDeclineCents).toBe(7200);
    }
  });

  it("mirrors the rule onto the listing on AUTO", () => {
    expect(bestOfferTerms(listing, auto())).toEqual({ enabled: true, autoAcceptCents: 9500, autoDeclineCents: 8000 });
  });

  it("withholds the auto-accept price when an offer could cross the ceiling", () => {
    // eBay's autoAcceptPrice has no upper bound, so it cannot express "never above $50 unattended".
    // A $100 listing can draw an offer over that ceiling, so the terms stay silent about accepting.
    expect(bestOfferTerms(listing, auto({ maxAutoAcceptCents: 5000 })).autoAcceptCents).toBeNull();
    expect(bestOfferTerms(listing, auto({ maxAutoAcceptCents: 10_000 })).autoAcceptCents).toBe(9500);
    expect(bestOfferTerms(listing, auto({ maxAutoAcceptCents: 0 })).autoAcceptCents).toBe(9500);
  });

  it("keeps the floor out of eBay's way when declining is switched off", () => {
    expect(bestOfferTerms(listing, auto({ declineBelowFloor: false })).autoDeclineCents).toBe(7200);
  });

  it("never hands eBay a decline price at or above its accept price", () => {
    // 100% accept on a $100 ask with a $100 floor: eBay would reject terms that contradict.
    expect(bestOfferTerms({ ...listing, floorPrice: 10_000 }, auto({ acceptAtOrAbovePercent: 100 })).autoDeclineCents).toBeNull();
  });

  it("leaves both prices unset when the item has no floor", () => {
    expect(bestOfferTerms({ ...listing, floorPrice: null }, null)).toEqual({ enabled: true, autoAcceptCents: null, autoDeclineCents: null });
  });
});
