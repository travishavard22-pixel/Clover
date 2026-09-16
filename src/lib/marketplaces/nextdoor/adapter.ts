import { db, type MarketplaceConnection } from "../../db";
import { encryptSecret } from "../../crypto";
import { storage } from "../../storage";
import { MARKETPLACES } from "../registry";
import { renderListing } from "../render";
import { selectListingPhotos } from "../photos";
import { loadSellerPrefs } from "../prefs";
import { toRenderDraft, toRenderItem } from "../drafts";
import type { ConnectionCapabilities, MarketplaceAdapter, PreparedPublication, PublishResult } from "../types";
import { flatRunner, type PhasedAdapter, type PublishInput, type StepRunner } from "../phased";
import { nextdoorCategoryFor } from "./categories";
import { NextdoorApiError, NextdoorReauthError } from "./client";
import { displayNameFromIdToken, exchangeNextdoorCode, nextdoorAuthorizeUrl, NEXTDOOR_SCOPES } from "./oauth";
import { createFsfPost, markFsfSold, nextdoorPrice } from "./publish";

/** Seven days: long enough for Nextdoor to fetch the photos, short enough to stay least-privilege. */
const IMAGE_URL_TTL_SECONDS = 7 * 24 * 3600;

function mapNextdoorError(err: unknown): PublishResult {
  if (err instanceof NextdoorReauthError) return { status: "NEEDS_ATTENTION", attention: { code: "reauth", message: "Nextdoor authorization has expired.", recovery: "Reconnect Nextdoor from Connections, then publish again." } };
  if (err instanceof NextdoorApiError) {
    if (err.retryable) return { status: "FAILED", error: `Nextdoor is temporarily unavailable (${err.status}).`, retryable: true };
    const body = err.body.slice(0, 200);
    if (/image|attachment/i.test(body)) return { status: "NEEDS_ATTENTION", attention: { code: "photos_invalid", message: "Nextdoor could not fetch one of the photos.", recovery: "Re-upload the photo and publish again.", field: "photos" } };
    if (/price/i.test(body)) return { status: "NEEDS_ATTENTION", attention: { code: "price_invalid", message: "Nextdoor rejected the price.", recovery: "Set a whole-dollar price and publish again.", field: "price" } };
    if (/category/i.test(body)) return { status: "NEEDS_ATTENTION", attention: { code: "category_invalid", message: "Nextdoor rejected the category.", recovery: "Choose a different category in the listing.", field: "category" } };
    return { status: "NEEDS_ATTENTION", attention: { code: `nextdoor_${err.status}`, message: body || `Nextdoor returned an error (${err.status}).`, recovery: "Review the listing and try again, or post it on Nextdoor yourself and paste the link." } };
  }
  return { status: "FAILED", error: err instanceof Error ? err.message : String(err), retryable: false };
}

/**
 * Nextdoor Publish API adapter (closed beta). Only active when NEXTDOOR_CLIENT_ID/SECRET are set;
 * otherwise the registry serves Nextdoor through the assisted adapter.
 */
export class NextdoorAdapter implements PhasedAdapter {
  readonly marketplace = "NEXTDOOR" as const;

  capabilities(): ConnectionCapabilities {
    return { connect: "oauth", publish: "api", update: "assisted", end: "api", offers: "manual", orders: "manual", messages: "none" };
  }

  authorizeUrl(state: string): string {
    return nextdoorAuthorizeUrl(state);
  }

  async handleCallback(userId: string, code: string): Promise<MarketplaceConnection> {
    const t = await exchangeNextdoorCode(code);
    const name = displayNameFromIdToken(t.idToken) ?? "Nextdoor account";
    const base = {
      status: "CONNECTED" as const,
      mode: "api",
      externalAccountId: null,
      externalAccountName: name,
      scopes: t.scopes.length ? t.scopes : [...NEXTDOOR_SCOPES],
      refreshTokenEnc: t.refreshToken ? encryptSecret(t.refreshToken) : null,
      accessTokenEnc: encryptSecret(t.accessToken),
      accessTokenExpiresAt: t.expiresAt,
      refreshTokenExpiresAt: null,
      lastError: null,
      connectedAt: new Date(),
      metadata: { nextdoor: { displayName: name } },
    };
    return db.marketplaceConnection.upsert({ where: { userId_marketplace: { userId, marketplace: "NEXTDOOR" } }, create: { userId, marketplace: "NEXTDOOR", ...base }, update: base });
  }

  async disconnect(userId: string): Promise<void> {
    await db.marketplaceConnection.deleteMany({ where: { userId, marketplace: "NEXTDOOR" } });
  }

  async prepare(input: Parameters<MarketplaceAdapter["prepare"]>[0]): Promise<PreparedPublication> {
    const info = MARKETPLACES.NEXTDOOR;
    const prefs = await loadSellerPrefs(input.item.userId);
    const rendered = renderListing("NEXTDOOR", { item: toRenderItem(input.item), drafts: [toRenderDraft(input.draft)], prefs });
    const photos = selectListingPhotos(input.photos, info.limits.photosMax);
    const photoUrls = await Promise.all(photos.map((p) => input.photoUrl(p, IMAGE_URL_TTL_SECONDS)));
    const priceCents = rendered.priceCents ?? 0;
    const warnings = [...rendered.warnings];
    if (!priceCents) warnings.push("No price set. Add a list price before publishing.");
    if (photos.length === 0) warnings.push("Nextdoor requires at least one photo.");
    if (priceCents % 100) warnings.push("Nextdoor takes whole dollars; the price will be rounded.");
    return { title: rendered.title, description: rendered.description, priceCents, conditionLabel: rendered.conditionLabel, categoryLabel: rendered.categoryHint, specifics: rendered.specifics, photoUrls, warnings, feePreview: { fees: 0, net: priceCents, note: info.fees.note } };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    return this.publishPhased(input, flatRunner(input.report));
  }

  async publishPhased(input: PublishInput, run: StepRunner): Promise<PublishResult> {
    const { item, draft, connection, prepared } = input;
    if (!connection || connection.status !== "CONNECTED") return { status: "NEEDS_ATTENTION", attention: { code: "not_connected", message: "Nextdoor is not connected.", recovery: "Connect Nextdoor from Connections, then publish again." } };
    if (prepared.priceCents < 100) return { status: "NEEDS_ATTENTION", attention: { code: "price_missing", message: "Nextdoor needs a whole-dollar price of at least $1.", recovery: "Set a list price, then publish again.", field: "price" } };
    const photos = selectListingPhotos(input.photos, MARKETPLACES.NEXTDOOR.limits.photosMax);
    if (photos.length === 0) return { status: "NEEDS_ATTENTION", attention: { code: "photos_missing", message: "Nextdoor requires at least one photo.", recovery: "Add a photo to the item, then publish again.", field: "photos" } };
    try {
      const imageUrls = await run("photos", `Preparing ${photos.length} photo link${photos.length === 1 ? "" : "s"} for Nextdoor`, async (report) => {
        const urls = prepared.photoUrls.length === photos.length ? prepared.photoUrls : await Promise.all(photos.map((p) => storage.url(p.storageKey, IMAGE_URL_TTL_SECONDS)));
        await report(`Nextdoor will fetch ${photos.length} photo${photos.length === 1 ? "" : "s"} from Clover's signed links`);
        return urls.filter((u) => u.startsWith("https://"));
      });
      if (imageUrls.length === 0) return { status: "NEEDS_ATTENTION", attention: { code: "photos_not_public", message: "Nextdoor can only fetch photos from public HTTPS links, and this deployment serves them over http.", recovery: "Publish from a deployment with an https APP_URL, or post on Nextdoor yourself.", field: "photos" } };
      const category = await run("category", "Choosing the Nextdoor category", async (report) => {
        const path = draft.categoryPath.length ? draft.categoryPath : item.categoryPath;
        const cat = nextdoorCategoryFor(path) ?? { id: "OTHER" as const, label: "Other" };
        await report(`Category: ${cat.label}`, { category: cat.id });
        return cat;
      });
      await run("fees", "Previewing fees", async (report) => report("Nextdoor charges no selling fees"));
      return await run("publish", "Publishing to Nextdoor", async (report) => {
        const res = await createFsfPost(connection, { title: prepared.title, description: prepared.description, price: nextdoorPrice(prepared.priceCents), category: category.id, imageUrls, bodyText: prepared.description });
        await report(`Published — ${res.shareLink || "post created"}`, { shareLink: res.shareLink });
        return { status: "PUBLISHED" as const, externalId: res.postId ?? res.shareLink, externalUrl: res.shareLink || null, externalMeta: { category: category.id, shareLink: res.shareLink }, feePreview: { fees: [], totalCents: 0, source: "nextdoor:none" } };
      });
    } catch (err) {
      return mapNextdoorError(err);
    }
  }

  /** The FSF reference documents create and mark-sold; price edits are done by the seller on Nextdoor. */
  async update(input: Parameters<MarketplaceAdapter["update"]>[0]): Promise<PublishResult> {
    const price = (input.priceCents / 100).toFixed(0);
    return {
      status: "REQUIRES_USER_ACTION",
      checklist: [
        { key: "open_listing", label: "Open your listing on Nextdoor", done: false, href: input.publication.externalUrl ?? MARKETPLACES.NEXTDOOR.createUrl ?? undefined },
        { key: "price", label: `Change the price to $${price}`, done: false, copyText: price },
        { key: "updated", label: "I updated it", done: false },
      ],
      externalUrl: input.publication.externalUrl,
      message: "Nextdoor's Publish API does not edit prices, so this step is yours.",
    };
  }

  async end(input: Parameters<MarketplaceAdapter["end"]>[0]): ReturnType<MarketplaceAdapter["end"]> {
    const { publication, connection } = input;
    if (input.reason !== "sold_elsewhere") {
      return { status: "REQUIRES_USER_ACTION", message: "Nextdoor's Publish API only marks a listing sold. Remove the post yourself to withdraw it.", externalUrl: publication.externalUrl };
    }
    if (!connection || connection.status !== "CONNECTED" || !publication.externalId) return { status: "FAILED", message: "Nextdoor is not connected, so the listing could not be marked sold.", externalUrl: publication.externalUrl };
    try {
      await markFsfSold(connection, publication.externalId);
      return { status: "ENDED", externalUrl: publication.externalUrl };
    } catch (err) {
      return { status: "FAILED", message: err instanceof Error ? err.message : "Nextdoor could not mark the listing sold.", externalUrl: publication.externalUrl };
    }
  }
}
