import { getAiProvider } from "../ai";
import type { WriteListingInput } from "../ai/provider";
import { verifiedAttributesFromProfile, type ItemProfile, type ListingCopy, type ListingLength, type ListingTone, type SelfCheck } from "../ai/schemas";
import { ApiError } from "../api";
import { db, type Item, type ListingDraft, type Marketplace, type PriceEstimate, type UserPreferences } from "../db";
import { MARKETPLACES } from "../marketplaces/registry";
import { parseProfile } from "../pricing/service";
import type { ShippingContext } from "./compose";
import { deriveForMarketplace } from "./derive";
import { limitsForKey, saveDraft, type DraftKey } from "./store";

/**
 * Listing generation: one GENERIC master written by the AI provider from the verified attributes
 * (never the photos), then a deterministic derivation per marketplace. Every result is persisted as a
 * draft with a version snapshot.
 */

export type ListingContext = {
  item: Item;
  profile: ItemProfile;
  estimate: PriceEstimate | null;
  prefs: Pick<UserPreferences, "offersShipping" | "offersLocalPickup" | "defaultShippingNote" | "city" | "region" | "defaultMarketplaces"> | null;
};

export async function loadListingContext(itemId: string): Promise<ListingContext> {
  const item = await db.item.findUnique({ where: { id: itemId }, include: { profile: true, estimate: true, user: { select: { preferences: true } } } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  const profile = item.profile ? parseProfile(item.profile.data) : null;
  if (!profile) throw new ApiError(409, "This item has not been identified yet. Run analysis first.", "no_profile");
  const { profile: _p, estimate, user, ...rest } = item;
  void _p;
  return { item: rest as Item, profile, estimate, prefs: user.preferences };
}

export function shippingContextFor(prefs: ListingContext["prefs"]): ShippingContext {
  const city = [prefs?.city, prefs?.region].filter(Boolean).join(", ");
  return {
    offersShipping: prefs?.offersShipping ?? true,
    offersLocalPickup: prefs?.offersLocalPickup ?? true,
    note: prefs?.defaultShippingNote ?? null,
    city: city || null,
  };
}

export function vocabularyFrom(estimate: PriceEstimate | null): string[] {
  const m = estimate?.method as { vocabulary?: unknown } | null;
  return Array.isArray(m?.vocabulary) ? (m!.vocabulary as unknown[]).filter((v): v is string => typeof v === "string") : [];
}

export function buildWriteInput(ctx: ListingContext, key: DraftKey, extra: { tone?: ListingTone; length?: ListingLength; existing?: ListingCopy; instruction?: string } = {}): WriteListingInput {
  const priceCents = ctx.item.listPrice ?? ctx.estimate?.recommended ?? null;
  return {
    profile: ctx.profile,
    verifiedAttributes: verifiedAttributesFromProfile(ctx.profile).map(({ name, value }) => ({ name, value })),
    unknowns: ctx.profile.unknowns,
    marketplace: key === "generic" ? "GENERIC" : key,
    priceCents,
    shipping: shippingContextFor(ctx.prefs),
    compsVocabulary: vocabularyFrom(ctx.estimate),
    limits: limitsForKey(key),
    ...extra,
  };
}

export type GenerateOptions = {
  /** Defaults to the seller's default marketplaces. */
  marketplaces?: Marketplace[];
  reason?: string;
  tone?: ListingTone;
};

export type GenerateResult = { master: ListingDraft; derived: ListingDraft[]; selfCheck: SelfCheck; generatedBy: string };

/** Writes the master draft and derives one draft per marketplace. */
export async function generateListingDrafts(itemId: string, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const ctx = await loadListingContext(itemId);
  const ai = await getAiProvider();
  const { copy, selfCheck, model } = await ai.writeListing(buildWriteInput(ctx, "generic", { tone: opts.tone }));
  const generatedBy = `${ai.name}:${model}`;
  const reason = opts.reason ?? "generated";
  const price = ctx.item.listPrice ?? ctx.estimate?.recommended ?? null;
  const master = await saveDraft(itemId, "generic", copy, { generatedBy, selfCheck, reason, price });

  const wanted = (opts.marketplaces ?? (ctx.prefs?.defaultMarketplaces as Marketplace[] | undefined) ?? ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR"]).filter((m): m is Marketplace => m in MARKETPLACES);
  const shipping = shippingContextFor(ctx.prefs);
  const derived: ListingDraft[] = [];
  for (const m of wanted) {
    const d = deriveForMarketplace(copy, m, { shipping, conditionGrade: ctx.item.conditionGrade ?? ctx.profile.condition.grade });
    derived.push(await saveDraft(itemId, m, d, { generatedBy: `derived:${ai.name}`, selfCheck, reason, price }));
  }
  return { master, derived, selfCheck, generatedBy };
}
