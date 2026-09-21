import type { Marketplace } from "../../db";
import { MARKETPLACES } from "../../marketplaces/registry";
import type { AutoPublishConfig, EvaluationContext, Evaluator, Proposal, SnapshotItem } from "../types";
import { listNames, money, plural, shortTitle } from "./shared";

/**
 * Lists an item once analysis has finished, but only when nothing about it needs a human.
 *
 * Publishing is the one automation whose output strangers read. A wrong price can be corrected; a
 * listing that describes the wrong object, or makes a claim the photos do not support, is a bad
 * listing under the seller's name on a marketplace that keeps score. So every check here is a
 * reason to *stop*, and the proposal carries the reasons it passed rather than a bare verdict:
 *
 * - **Identity.** The identification's own confidence, which the pipeline already escalates on.
 * - **Evidence.** `MARKET_EVIDENCE` means the price came from real comparable listings. An
 *   `AI_ESTIMATE` is a guess, and guesses are not published unattended by default.
 * - **Copy.** The listing writer checks its own claims against the identification; anything other
 *   than a clean pass means a sentence in the description is not supported by what Clover knows.
 * - **Photos** and a **floor price**, because a listing with neither is one the seller has not
 *   finished.
 *
 * What it will not do: publish to a marketplace that is not connected, re-publish something that
 * is already live, or touch an item whose analysis left it anywhere other than READY.
 */

export type PublishBlocker = { code: "status" | "identity" | "evidence" | "self_check" | "photos" | "price" | "floor" | "nowhere" | "already"; message: string };

export type PublishReadiness = {
  ready: boolean;
  blockers: PublishBlocker[];
  /** Why it is ready, in the seller's terms. Empty when it is not. */
  reasons: string[];
  marketplaces: Marketplace[];
};

const pctOf = (v: number | null) => (v === null ? null : Math.round(v * 100));

/** Marketplaces this seller can publish to right now, in their preferred order. */
export function publishableMarketplaces(ctx: EvaluationContext, item: SnapshotItem): Marketplace[] {
  const live = new Set(item.publications.filter((p) => p.status !== "ENDED" && p.status !== "FAILED").map((p) => p.marketplace));
  const connected = new Map(ctx.connections.map((c) => [c.marketplace, c]));
  const wanted = ctx.preferences.defaultMarketplaces.length ? ctx.preferences.defaultMarketplaces : (Object.keys(MARKETPLACES) as Marketplace[]);
  return wanted.filter((m) => {
    if (live.has(m)) return false;
    // An assisted marketplace needs no connection — publishing there builds the seller's own
    // checklist. An API-only one does, or the publish would stop at "connect eBay first".
    if (MARKETPLACES[m].mode !== "api") return true;
    return connected.get(m)?.status === "CONNECTED";
  });
}

/** The whole decision, as a pure function. Exported because this is the part worth testing hard. */
export function publishReadiness(ctx: EvaluationContext, item: SnapshotItem, config: AutoPublishConfig): PublishReadiness {
  const blockers: PublishBlocker[] = [];
  const reasons: string[] = [];

  if (item.status !== "READY") {
    return { ready: false, blockers: [{ code: "status", message: `Item is ${item.status.toLowerCase().replace(/_/g, " ")}, not ready to list.` }], reasons: [], marketplaces: [] };
  }

  const identity = pctOf(item.profile?.identityConfidence ?? null);
  if (identity === null) blockers.push({ code: "identity", message: "No identification on file." });
  else if (identity < config.minIdentityConfidencePercent) blockers.push({ code: "identity", message: `Identified with ${identity}% confidence, under your ${config.minIdentityConfidencePercent}% bar.` });
  else reasons.push(`identified with ${identity}% confidence`);

  if (config.requireMarketEvidence) {
    if (item.estimate?.basis === "MARKET_EVIDENCE") reasons.push("priced from real comparable listings");
    else blockers.push({ code: "evidence", message: item.estimate ? "Priced from an AI estimate rather than comparable listings." : "No price estimate yet." });
  }

  if (config.requireSelfCheckPass) {
    const verdicts = item.drafts.map((d) => d.selfCheckVerdict);
    if (!verdicts.length) blockers.push({ code: "self_check", message: "No listing copy written yet." });
    else if (verdicts.some((v) => v !== "pass")) blockers.push({ code: "self_check", message: "The listing copy has claims the identification does not support." });
    else reasons.push("copy passed its own claim check");
  }

  if (item.photos.length < config.minPhotos) blockers.push({ code: "photos", message: `${plural(item.photos.length, "photo")} — you asked for at least ${config.minPhotos}.` });
  else reasons.push(plural(item.photos.length, "photo"));

  if (!item.listPrice) blockers.push({ code: "price", message: "No list price set." });
  if (config.requireFloorPrice && !item.floorPrice) blockers.push({ code: "floor", message: "No floor price, so there is no stop under the price." });
  else if (item.floorPrice) reasons.push(`floor at ${money(item.floorPrice)}`);

  const marketplaces = publishableMarketplaces(ctx, item);
  if (!marketplaces.length) {
    const anyLive = item.publications.some((p) => p.status !== "ENDED" && p.status !== "FAILED");
    blockers.push(anyLive ? { code: "already", message: "Already listed everywhere you publish by default." } : { code: "nowhere", message: "No marketplace to publish to — connect one, or add it to your default marketplaces." });
  }

  return { ready: blockers.length === 0, blockers, reasons: blockers.length === 0 ? reasons : [], marketplaces };
}

export const evaluateAutoPublish: Evaluator<"AUTO_PUBLISH"> = (ctx, config: AutoPublishConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.status !== "READY") continue;
    const readiness = publishReadiness(ctx, item, config);
    if (!readiness.ready) continue;

    const where = listNames(readiness.marketplaces);
    // The price is part of the key: a re-priced item is a different proposal, not a repeat of one
    // the seller already dismissed.
    const key = `publish:${item.id}:${item.listPrice}:${readiness.marketplaces.join(",")}`;
    out.push({
      type: "AUTO_PUBLISH",
      itemId: item.id,
      title: `List ${shortTitle(item.title)} on ${where}`,
      body: `${money(item.listPrice)} — ${readiness.reasons.join(", ")}.`,
      proposal: { key, action: "publish", itemId: item.id, marketplaces: readiness.marketplaces, priceCents: item.listPrice!, reason: readiness.reasons.join(", ") },
      autoExecutable: true,
      notifyPreference: "notifyPublishing",
    });
  }
  return out;
};
