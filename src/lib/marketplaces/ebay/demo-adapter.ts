import { db, type MarketplaceConnection } from "../../db";
import { formatMoney } from "../../money";
import { MARKETPLACES, estimateFees } from "../registry";
import { renderListing } from "../render";
import { selectListingPhotos } from "../photos";
import { loadSellerPrefs } from "../prefs";
import { toRenderDraft, toRenderItem } from "../drafts";
import type { ConnectionCapabilities, MarketplaceAdapter, PreparedPublication, PublishResult, SyncedOffer, SyncedOrder } from "../types";
import { flatRunner, type PhasedAdapter, type PublishInput, type StepRunner } from "../phased";
import { EBAY_USER_SCOPES } from "./config";
import { knownSpecifics } from "./adapter";
import { demoAccount, demoFeePreview, demoListingId, demoListingUrl, demoOfferFor, demoOrderId, demoRequiredAspects, isDemoListingId } from "./demo";
import { findSpecific } from "../render";

export const DEMO_CONSENT_PATH = "/connections/ebay/demo-consent";

/**
 * Demo eBay adapter. Used when no eBay credentials are configured (research §9 runtime modes).
 * It walks the exact same states as the real adapter — consent, publishing steps, fee preview,
 * buyer offers, orders — with locally generated data. Everything it produces is labelled Demo in
 * the UI (connection.mode = "demo", ids prefixed `demo-ebay-`). Nothing is sent to eBay.
 */
export class DemoEbayAdapter implements PhasedAdapter {
  readonly marketplace = "EBAY" as const;

  capabilities(): ConnectionCapabilities {
    return { connect: "oauth", publish: "api", update: "api", end: "api", offers: "api", orders: "api", messages: "none" };
  }

  /** In-app consent screen standing in for auth.ebay.com. */
  authorizeUrl(state: string): string {
    return `${DEMO_CONSENT_PATH}?state=${encodeURIComponent(state)}`;
  }

  async handleCallback(userId: string): Promise<MarketplaceConnection> {
    const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
    const account = demoAccount(userId, user?.name ?? "seller");
    const base = {
      status: "CONNECTED" as const,
      mode: "demo",
      externalAccountId: account.externalAccountId,
      externalAccountName: account.externalAccountName,
      scopes: [...EBAY_USER_SCOPES],
      refreshTokenEnc: null,
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      lastError: null,
      connectedAt: new Date(),
      metadata: { demo: true, ebay: { username: account.externalAccountName, policies: { fulfillmentPolicyId: "demo-fulfillment", paymentPolicyId: "demo-payment", returnPolicyId: "demo-return" }, locationKey: "clover-default" } },
    };
    return db.marketplaceConnection.upsert({ where: { userId_marketplace: { userId, marketplace: "EBAY" } }, create: { userId, marketplace: "EBAY", ...base }, update: base });
  }

  async disconnect(userId: string): Promise<void> {
    await db.marketplaceConnection.deleteMany({ where: { userId, marketplace: "EBAY" } });
  }

  async prepare(input: Parameters<MarketplaceAdapter["prepare"]>[0]): Promise<PreparedPublication> {
    const info = MARKETPLACES.EBAY;
    const prefs = await loadSellerPrefs(input.item.userId);
    const rendered = renderListing("EBAY", { item: toRenderItem(input.item), drafts: [toRenderDraft(input.draft)], prefs });
    const photos = selectListingPhotos(input.photos, info.limits.photosMax);
    const photoUrls = await Promise.all(photos.map((p) => input.photoUrl(p, 3600)));
    const priceCents = rendered.priceCents ?? 0;
    const warnings = [...rendered.warnings];
    if (!priceCents) warnings.push("No price set. Add a list price before publishing.");
    if (!input.item.conditionGrade) warnings.push("Condition not set. eBay requires a condition.");
    if (photos.length === 0) warnings.push("eBay requires at least one photo.");
    const fees = priceCents ? estimateFees("EBAY", priceCents) : 0;
    return {
      title: rendered.title,
      description: rendered.description,
      priceCents,
      conditionLabel: rendered.conditionLabel,
      categoryLabel: rendered.categoryHint,
      specifics: knownSpecifics(input.item, input.draft),
      photoUrls,
      warnings,
      feePreview: { fees, net: priceCents - fees, note: `${info.fees.note} Demo: estimated locally.` },
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    return this.publishPhased(input, flatRunner(input.report));
  }

  async publishPhased(input: PublishInput, run: StepRunner): Promise<PublishResult> {
    const { item, draft, connection, prepared, publication } = input;
    if (!connection || connection.status !== "CONNECTED") {
      return { status: "NEEDS_ATTENTION", attention: { code: "not_connected", message: "eBay (demo) is not connected.", recovery: "Connect eBay from Connections, then publish again." } };
    }
    if (!item.conditionGrade) {
      return { status: "NEEDS_ATTENTION", attention: { code: "condition_missing", message: "eBay requires a condition.", recovery: "Set the condition grade on the item, then publish again.", field: "condition" } };
    }
    if (prepared.priceCents < 99) {
      return { status: "NEEDS_ATTENTION", attention: { code: "price_missing", message: "eBay needs a price of at least $0.99.", recovery: "Set a list price, then publish again.", field: "price" } };
    }
    const photos = selectListingPhotos(input.photos, MARKETPLACES.EBAY.limits.photosMax);
    if (photos.length === 0) {
      return { status: "NEEDS_ATTENTION", attention: { code: "photos_missing", message: "eBay requires at least one photo.", recovery: "Add a photo to the item, then publish again.", field: "photos" } };
    }

    await run("photos", `Uploading ${photos.length} photo${photos.length === 1 ? "" : "s"} to eBay (demo)`, async (report) => {
      for (let i = 0; i < photos.length; i++) await report(`Uploading photo ${i + 1} of ${photos.length} to eBay (demo)`);
      await report(`Uploaded ${photos.length} photo${photos.length === 1 ? "" : "s"} to eBay (demo)`);
    });

    const path = draft.categoryPath.length ? draft.categoryPath : item.categoryPath;
    const category = await run("category", "Mapping category and item specifics", async (report) => {
      const required = demoRequiredAspects(path);
      const known = knownSpecifics(item, draft);
      const missing = required.filter((name) => !findSpecific(known, name));
      const found = required.length - missing.length;
      await report(`Mapped to ${path.length ? path.join(" > ") : "Everything Else"}; ${found} of ${required.length} required specifics found (demo)`, { path, required, missing });
      return { path, missing, known };
    });
    if (category.missing.length) {
      const names = category.missing.map((n) => `'${n}'`).join(", ");
      return { status: "NEEDS_ATTENTION", attention: { code: "aspect_required", message: `eBay requires ${names} for ${path[path.length - 1] ?? "this category"}.`, recovery: `Add ${names} to the item specifics in the listing, then publish again.`, field: "specifics" } };
    }

    const feePreview = await run("fees", "Previewing fees", async (report) => {
      const fp = demoFeePreview(prepared.priceCents);
      await report(`eBay fee preview: ${formatMoney(fp.totalCents)} final value fee (demo estimate)`, { fees: fp.fees, totalCents: fp.totalCents });
      return fp;
    });

    return run("publish", "Publishing to eBay (demo)", async (report) => {
      const listingId = demoListingId(publication.id);
      await report(`Published — item ${listingId.replace("demo-ebay-", "")} (demo)`, { listingId });
      return {
        status: "PUBLISHED" as const,
        externalId: listingId,
        externalUrl: demoListingUrl(publication.id),
        externalMeta: { demo: true, offerId: `demo-offer-record-${publication.id}`, sku: item.sku, categoryPath: category.path, specifics: category.known },
        feePreview,
      };
    });
  }

  async update(input: Parameters<MarketplaceAdapter["update"]>[0]): Promise<PublishResult> {
    const { publication, connection } = input;
    if (!connection || connection.status !== "CONNECTED") {
      return { status: "NEEDS_ATTENTION", attention: { code: "not_connected", message: "eBay (demo) is not connected.", recovery: "Reconnect eBay from Connections, then try again." } };
    }
    const meta = (publication.externalMeta ?? {}) as Record<string, unknown>;
    return { status: "PUBLISHED", externalId: publication.externalId ?? demoListingId(publication.id), externalUrl: publication.externalUrl ?? demoListingUrl(publication.id), externalMeta: { ...meta, demo: true, lastPriceUpdateAt: new Date().toISOString() }, feePreview: demoFeePreview(input.priceCents) };
  }

  async end(input: Parameters<MarketplaceAdapter["end"]>[0]): ReturnType<MarketplaceAdapter["end"]> {
    return { status: "ENDED", externalUrl: input.publication.externalUrl };
  }

  /** One plausible pending offer per published demo listing; the sync handler upserts by externalId. */
  async syncOffers(input: { publication: { id: string; externalId: string | null; price: number | null; publishedAt: Date | null; status: string } }): Promise<SyncedOffer[]> {
    const p = input.publication;
    if (p.status !== "PUBLISHED" || !isDemoListingId(p.externalId) || !p.publishedAt || !p.price) return [];
    const offer = demoOfferFor({ publicationId: p.id, priceCents: p.price, publishedAt: p.publishedAt });
    return [{ externalId: offer.externalId, buyerName: offer.buyerName, buyerId: offer.buyerId, amountCents: offer.amountCents, message: offer.message, receivedAt: offer.receivedAt, expiresAt: offer.expiresAt, status: "PENDING" }];
  }

  async respondToOffer(): Promise<void> {
    // The demo buyer accepts whatever the seller decides; the offers domain records the outcome.
  }

  /** Accepted demo offers become orders on the next sync, mirroring eBay's checkout → Fulfillment flow. */
  async syncOrders(input: { connection: MarketplaceConnection; since: Date }): Promise<SyncedOrder[]> {
    const accepted = await db.offer.findMany({
      where: { userId: input.connection.userId, marketplace: "EBAY", status: "ACCEPTED", externalId: { startsWith: "demo-offer-" }, publication: { status: { in: ["PUBLISHED", "SOLD"] } } },
      include: { publication: { select: { id: true, externalId: true, status: true } } },
    });
    return accepted
      .filter((o) => o.publication?.externalId && isDemoListingId(o.publication.externalId))
      .map((o) => ({
        externalOrderId: demoOrderId(o.externalId ?? o.id),
        externalListingId: o.publication!.externalId!,
        salePriceCents: o.amount,
        feesCents: estimateFees("EBAY", o.amount),
        buyerName: o.buyerName,
        soldAt: o.respondedAt ?? new Date(),
      }));
  }
}
