import { db, type ConditionGrade } from "../db";
import { resolveConfig } from "./registry";
import type { OfferAutopilotConfig } from "./types";

/**
 * Translates the seller's OFFER_AUTOPILOT rule into eBay's own Best Offer terms.
 *
 * eBay answers offers server-side in seconds, whereas Clover's sweep runs on a schedule — so when
 * the seller has set the rule to run unattended, the listing itself should carry the same terms.
 * The two cannot express each other exactly, and the difference matters:
 *
 * - eBay's `autoAcceptPrice` is a floor on acceptance: it takes **anything** at or above it, with
 *   no upper bound. Clover's `maxAutoAcceptCents` ceiling exists to catch a mistyped asking price,
 *   so it is only safe to hand eBay an auto-accept price when no offer on this listing could cross
 *   that ceiling — which is to say when the asking price is itself under it.
 * - eBay's `autoDeclinePrice` declines everything below it, which is exactly the floor rule.
 * - eBay has no notion of a counter percentage. Counters stay with Clover's sweep.
 *
 * In any mode other than AUTO the seller has asked to be consulted, so the listing gets no
 * auto-accept price at all: Clover proposes and the seller decides.
 */
export type BestOfferTerms = { enabled: boolean; autoAcceptCents: number | null; autoDeclineCents: number | null };

export type OfferAutopilotRule = { mode: string; config: OfferAutopilotConfig } | null;

const pct = (cents: number, percent: number) => Math.round((cents * percent) / 100);

export function bestOfferTerms(input: { priceCents: number; floorPrice: number | null; conditionGrade: ConditionGrade | null }, rule: OfferAutopilotRule): BestOfferTerms {
  const enabled = input.conditionGrade !== "NEW_SEALED";
  if (!enabled) return { enabled: false, autoAcceptCents: null, autoDeclineCents: null };

  // Without an unattended rule, keep the conservative default: decline the obviously-too-low, and
  // leave everything else for a person (or for Clover to propose).
  if (!rule || rule.mode !== "AUTO") {
    return { enabled: true, autoAcceptCents: null, autoDeclineCents: input.floorPrice ? Math.round(input.floorPrice * 0.9) : null };
  }

  const { acceptAtOrAbovePercent, maxAutoAcceptCents, declineBelowFloor } = rule.config;
  const ceilingSafe = maxAutoAcceptCents <= 0 || input.priceCents <= maxAutoAcceptCents;
  const acceptAt = ceilingSafe ? Math.max(1, pct(input.priceCents, acceptAtOrAbovePercent)) : null;
  const declineBelow = input.floorPrice ? (declineBelowFloor ? input.floorPrice : Math.round(input.floorPrice * 0.9)) : null;
  // A decline price at or above the accept price would make eBay's terms contradict themselves.
  const autoDeclineCents = acceptAt !== null && declineBelow !== null && declineBelow >= acceptAt ? null : declineBelow;
  return { enabled: true, autoAcceptCents: acceptAt, autoDeclineCents };
}

/** Reads the seller's OFFER_AUTOPILOT rule. Returns null when they have never saved one. */
export async function offerAutopilotRule(userId: string): Promise<OfferAutopilotRule> {
  const row = await db.automationRule.findUnique({ where: { userId_type: { userId, type: "OFFER_AUTOPILOT" } } });
  if (!row) return null;
  return { mode: row.mode, config: resolveConfig("OFFER_AUTOPILOT", row.config) };
}

/** The Best Offer terms to put on a listing, read from the seller's rule. */
export async function bestOfferTermsForSeller(userId: string, input: { priceCents: number; floorPrice: number | null; conditionGrade: ConditionGrade | null }): Promise<BestOfferTerms> {
  return bestOfferTerms(input, await offerAutopilotRule(userId));
}
