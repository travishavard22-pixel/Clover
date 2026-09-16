import type { Item, ListingDraft, Marketplace } from "../db";
import { parseSpecifics, type RenderDraft, type RenderItem } from "./render";

/** Pick the draft a marketplace should publish from: its own draft, else the generic master draft. */
export function pickDraft(drafts: ListingDraft[], marketplace: Marketplace): ListingDraft | null {
  return drafts.find((d) => d.marketplace === marketplace) ?? drafts.find((d) => d.marketplace === null) ?? null;
}

/**
 * When an item has no draft at all (e.g. analysis skipped), publishing still needs copy. This
 * derives an honest minimal draft from the item record; it is never persisted, so the seller's
 * real drafts are untouched.
 */
export function syntheticDraft(item: Item): ListingDraft {
  const now = new Date();
  const description = [item.conditionNotes?.trim(), item.notes?.trim()].filter(Boolean).join("\n\n") || item.title;
  return {
    id: `synthetic-${item.id}`,
    itemId: item.id,
    marketplace: null,
    title: item.title,
    description,
    bullets: [],
    conditionText: item.conditionNotes ?? "",
    specifics: [],
    keywords: [],
    categoryPath: item.categoryPath,
    categoryId: null,
    price: item.listPrice,
    shipping: {},
    version: 0,
    generatedBy: "clover:synthetic",
    selfCheck: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function toRenderDraft(d: ListingDraft): RenderDraft {
  return {
    marketplace: d.marketplace,
    title: d.title,
    description: d.description,
    bullets: d.bullets,
    conditionText: d.conditionText,
    specifics: parseSpecifics(d.specifics),
    categoryPath: d.categoryPath,
    categoryId: d.categoryId,
    price: d.price,
  };
}

export function toRenderItem(item: Item): RenderItem {
  return {
    title: item.title,
    brand: item.brand,
    model: item.model,
    categoryPath: item.categoryPath,
    conditionGrade: item.conditionGrade,
    conditionNotes: item.conditionNotes,
    listPrice: item.listPrice,
    shippingCost: item.shippingCost,
  };
}

/** The price a publication will carry: the marketplace draft's price wins, then the item's list price. */
export function priceFor(item: Item, draft: ListingDraft | null): number | null {
  return draft?.price ?? item.listPrice ?? null;
}
