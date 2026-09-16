import type { ListingCopy } from "../ai/schemas";
import type { ConditionGrade, Marketplace } from "../db";
import { CONDITION_LABELS, fitDescription, fitTitle, MARKETPLACES } from "../marketplaces/registry";
import { parseDescription, renderDescription, sentences, shippingLine, stripOtherMarketplaceNames, type DescriptionModel, type ShippingContext } from "./compose";

/**
 * Deterministic derivation of a marketplace draft from the GENERIC master (research §4.2): fit to the
 * marketplace's limits, drop the specifics table where the marketplace has no structured fields, use
 * the marketplace's own pickup/shipping line and condition vocabulary, never mention another
 * marketplace, and phrase local-only marketplaces as local-only. No model call, no new facts.
 */

/** Marketplaces without a structured item-specifics table. */
export const NO_SPECIFICS: ReadonlySet<Marketplace> = new Set(["FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST"]);
/** Marketplaces where a listing is a local hand-off only. */
export const LOCAL_ONLY: ReadonlySet<Marketplace> = new Set(["NEXTDOOR", "CRAIGSLIST"]);
/** Keyword / hashtag budgets where the marketplace caps them. */
const KEYWORD_LIMITS: Partial<Record<Marketplace, number>> = { MERCARI: 3, POSHMARK: 5 };

export type DeriveContext = { shipping: ShippingContext; conditionGrade: ConditionGrade | null };

export function conditionVocabulary(marketplace: Marketplace, grade: ConditionGrade): string {
  const c = CONDITION_LABELS[grade];
  switch (marketplace) {
    case "EBAY":
      return c.ebayName;
    case "FACEBOOK":
      return c.facebook;
    case "OFFERUP":
      return c.offerup;
    case "MERCARI":
      return c.mercari;
    case "POSHMARK":
      return c.poshmark;
    default:
      return c.generic;
  }
}

/** Removes shipping talk from free paragraphs on local-only marketplaces (the footer states pickup). */
function localOnlyIntro(intro: string[]): string[] {
  return intro
    .map((p) =>
      sentences(p)
        .filter((s) => !/\b(ship|shipping|shipped|mail|postage|checkout)\b/i.test(s))
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
}

/** Shrinks the description in fact-preserving steps until it fits: drop the included list, then extra intro paragraphs, then truncate. */
function fitModel(model: DescriptionModel, max: number): string {
  let text = renderDescription(model);
  if (text.length <= max) return text;
  const withoutIncluded: DescriptionModel = { ...model, sections: model.sections.filter((s) => s.key !== "included") };
  text = renderDescription(withoutIncluded);
  if (text.length <= max) return text;
  const shortIntro: DescriptionModel = { ...withoutIncluded, intro: withoutIncluded.intro.slice(0, 1).map((p) => sentences(p).slice(0, 2).join(" ")) };
  text = renderDescription(shortIntro);
  if (text.length <= max) return text;
  return fitDescription(text, max);
}

export function deriveForMarketplace(master: ListingCopy, marketplace: Marketplace, ctx: DeriveContext): ListingCopy {
  const info = MARKETPLACES[marketplace];
  const model = parseDescription(stripOtherMarketplaceNames(master.description, marketplace));
  const localOnly = LOCAL_ONLY.has(marketplace) || !info.supportsShipping;
  if (localOnly) model.intro = localOnlyIntro(model.intro);
  // Always end with the marketplace's own pickup/shipping line (replacing whatever the master had).
  model.footer = shippingLine(marketplace, localOnly ? { ...ctx.shipping, offersShipping: false, offersLocalPickup: true } : ctx.shipping);

  const grade = ctx.conditionGrade;
  const vocab = grade ? conditionVocabulary(marketplace, grade) : null;
  const conditionText = vocab && !master.conditionText.toLowerCase().startsWith(vocab.toLowerCase()) ? `${vocab}. ${master.conditionText}` : master.conditionText;

  const keywordLimit = KEYWORD_LIMITS[marketplace];
  return {
    title: fitTitle(stripOtherMarketplaceNames(master.title, marketplace), info.limits.titleMax),
    description: fitModel(model, info.limits.descriptionMax),
    bullets: master.bullets.map((b) => stripOtherMarketplaceNames(b, marketplace)).filter(Boolean),
    conditionText,
    specifics: NO_SPECIFICS.has(marketplace) ? [] : master.specifics,
    keywords: keywordLimit ? master.keywords.slice(0, keywordLimit) : master.keywords,
    suggestedCategoryPath: master.suggestedCategoryPath,
  };
}
