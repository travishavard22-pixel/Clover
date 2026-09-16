import type { Marketplace } from "../../db";
import { MARKETPLACES } from "../registry";
import { renderListing } from "../render";
import { selectListingPhotos } from "../photos";
import { loadSellerPrefs } from "../prefs";
import { toRenderDraft, toRenderItem } from "../drafts";
import { estimateFees } from "../registry";
import type { ConnectionCapabilities, MarketplaceAdapter, PreparedPublication, PublishResult } from "../types";
import { assistedDisclosure, buildChecklist, endListingChecklist, updatePriceChecklist } from "./checklist";

export function photoPackHref(itemId: string, marketplace: Marketplace): string {
  return `/api/items/${itemId}/publications/${marketplace}/photo-pack`;
}

/**
 * Assisted publishing for marketplaces without a listing API (Facebook Marketplace, OfferUp,
 * Craigslist, Mercari, Poshmark, and Nextdoor until its Publish API is approved). The human does
 * every action on the marketplace's own site; Clover prepares copy, files and a plain link, and
 * records what the seller tells it. Nothing here logs in, submits forms or reads third-party pages.
 */
export class AssistedAdapter implements MarketplaceAdapter {
  constructor(readonly marketplace: Marketplace) {}

  capabilities(): ConnectionCapabilities {
    return { connect: "none", publish: "assisted", update: "assisted", end: "assisted", offers: "manual", orders: "manual", messages: "none" };
  }

  async disconnect(): Promise<void> {
    // Nothing is stored for assisted marketplaces.
  }

  async prepare(input: Parameters<MarketplaceAdapter["prepare"]>[0]): Promise<PreparedPublication> {
    const info = MARKETPLACES[this.marketplace];
    const prefs = await loadSellerPrefs(input.item.userId);
    const rendered = renderListing(this.marketplace, { item: toRenderItem(input.item), drafts: [toRenderDraft(input.draft)], prefs });
    const photos = selectListingPhotos(input.photos, info.limits.photosMax);
    const photoUrls = await Promise.all(photos.map((p) => input.photoUrl(p, 6 * 3600)));
    const priceCents = rendered.priceCents ?? 0;
    const warnings = [...rendered.warnings];
    if (!rendered.priceCents) warnings.push("No price set. Add a list price before publishing.");
    if (photos.length === 0) warnings.push("No photos yet. Add at least one photo.");
    const local = info.supportsLocal && prefs.offersLocalPickup && !(info.supportsShipping && prefs.offersShipping);
    const fees = priceCents ? estimateFees(this.marketplace, priceCents, { local }) : 0;
    return {
      title: rendered.title,
      description: rendered.description,
      priceCents,
      conditionLabel: rendered.conditionLabel,
      categoryLabel: rendered.categoryHint,
      specifics: rendered.specifics,
      photoUrls,
      warnings,
      feePreview: { fees, net: priceCents - fees, note: info.fees.note },
    };
  }

  async publish(input: Parameters<MarketplaceAdapter["publish"]>[0]): Promise<PublishResult> {
    const info = MARKETPLACES[this.marketplace];
    const prefs = await loadSellerPrefs(input.item.userId);
    const rendered = renderListing(this.marketplace, { item: toRenderItem(input.item), drafts: [toRenderDraft(input.draft)], prefs });
    const photoCount = selectListingPhotos(input.photos, info.limits.photosMax).length;
    await input.report(`Prepared the ${info.shortName} checklist — ${photoCount} photo${photoCount === 1 ? "" : "s"} in the pack`);
    return {
      status: "REQUIRES_USER_ACTION",
      checklist: buildChecklist({ marketplace: this.marketplace, itemId: input.item.id, rendered, photoCount, photoPackHref: photoPackHref(input.item.id, this.marketplace) }),
      externalUrl: input.publication.externalUrl ?? null,
      message: assistedDisclosure(this.marketplace),
    };
  }

  async update(input: Parameters<MarketplaceAdapter["update"]>[0]): Promise<PublishResult> {
    return {
      status: "REQUIRES_USER_ACTION",
      checklist: updatePriceChecklist(this.marketplace, input.publication.externalUrl, input.priceCents),
      externalUrl: input.publication.externalUrl ?? null,
      message: `Update the price on ${MARKETPLACES[this.marketplace].name} yourself, then confirm here. ${assistedDisclosure(this.marketplace)}`,
    };
  }

  async end(input: Parameters<MarketplaceAdapter["end"]>[0]): ReturnType<MarketplaceAdapter["end"]> {
    const info = MARKETPLACES[this.marketplace];
    const why = input.reason === "sold_elsewhere" ? "This item sold elsewhere." : "You chose to end this listing.";
    return {
      status: "REQUIRES_USER_ACTION",
      message: `${why} End the ${info.name} listing yourself so nobody else buys it, then confirm here.`,
      externalUrl: input.publication.externalUrl ?? info.createUrl,
    };
  }

  /** The checklist used when a live assisted listing must be ended (double-sell guard, withdraw). */
  endChecklist(externalUrl: string | null) {
    return endListingChecklist(this.marketplace, externalUrl);
  }
}
