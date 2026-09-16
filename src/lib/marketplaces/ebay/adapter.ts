import { db, Prisma, type ConditionGrade, type Item, type ListingDraft, type MarketplaceConnection, type Photo } from "../../db";
import { encryptSecret } from "../../crypto";
import { storage } from "../../storage";
import { formatMoney } from "../../money";
import { CONDITION_LABELS, MARKETPLACES, estimateFees } from "../registry";
import { findSpecific, mergeSpecifics, parseSpecifics, renderListing } from "../render";
import { selectListingPhotos } from "../photos";
import { loadSellerPrefs, locationOf } from "../prefs";
import { toRenderDraft, toRenderItem } from "../drafts";
import type { ConnectionCapabilities, MarketplaceAdapter, PreparedPublication, PublishResult, SyncedOffer, SyncedOrder } from "../types";
import { flatRunner, type PhasedAdapter, type PublishInput, type StepRunner } from "../phased";
import { CLOVER_LOCATION_KEY, createInventoryLocation, getOptedInPrograms, getOrCreateDefaultPolicies, optInToProgram, type EbayPolicies } from "./account";
import { EBAY_USER_SCOPES } from "./config";
import { EbayApiError, mapEbayError } from "./errors";
import { getOrders } from "./fulfillment";
import { createOffer, createOrReplaceInventoryItem, ebayListingUrl, getListingFees, getOfferBySku, publishOffer, updateOffer, updatePrice, withdrawOffer } from "./inventory";
import { uploadListingImage } from "./media";
import { ebayAuthorizeUrl, exchangeEbayCode, getEbayIdentity } from "./oauth";
import { getCategorySuggestions, getItemAspectsForCategory, type CategoryAspect } from "./taxonomy";
import { getBestOffers, respondToBestOffer } from "./trading-best-offer";

/** Inventory API `ConditionEnum` for each of our grades (eBay condition id → enum name). */
export const EBAY_CONDITION_ENUM: Record<ConditionGrade, string> = {
  NEW_SEALED: "NEW",
  NEW_OPEN_BOX: "NEW_OTHER",
  LIKE_NEW: "LIKE_NEW",
  VERY_GOOD: "USED_VERY_GOOD",
  GOOD: "USED_GOOD",
  FAIR: "USED_ACCEPTABLE",
  FOR_PARTS: "FOR_PARTS_OR_NOT_WORKING",
};

export type EbayConnectionMeta = { ebay?: { policies?: EbayPolicies; locationKey?: string; username?: string; programs?: string[] } };

export function readEbayMeta(c: MarketplaceConnection): NonNullable<EbayConnectionMeta["ebay"]> {
  const meta = (c.metadata ?? {}) as EbayConnectionMeta;
  return meta.ebay ?? {};
}

/** Pure: resolve REQUIRED aspects against what we know. Returns the aspect map plus the names still missing. */
export function resolveAspects(aspects: CategoryAspect[], known: Array<{ name: string; value: string }>): { aspects: Record<string, string[]>; missing: string[]; matchedRequired: number } {
  const out: Record<string, string[]> = {};
  const missing: string[] = [];
  let matchedRequired = 0;
  const norm = (s: string) => s.trim().toLowerCase();
  for (const a of aspects) {
    const value = findSpecific(known, a.name);
    if (value) {
      let v = value;
      if (a.mode === "SELECTION_ONLY" && a.values.length) {
        const hit = a.values.find((x) => norm(x) === norm(value)) ?? a.values.find((x) => norm(x).includes(norm(value)) || norm(value).includes(norm(x)));
        if (!hit) {
          if (a.required) missing.push(a.name);
          continue;
        }
        v = hit;
      }
      out[a.name] = [v.slice(0, 65)];
      if (a.required) matchedRequired++;
    } else if (a.required) {
      missing.push(a.name);
    }
  }
  // Anything we know that eBay did not list is still sent as a free-text aspect (buyers search on it).
  for (const s of known) if (!(s.name in out) && !aspects.some((a) => norm(a.name) === norm(s.name))) out[s.name] = [s.value.slice(0, 65)];
  return { aspects: out, missing, matchedRequired };
}

export function knownSpecifics(item: Item, draft: ListingDraft): Array<{ name: string; value: string }> {
  const attrs = (item.attributes ?? {}) as Record<string, unknown>;
  const fromAttrs = Object.entries(attrs)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .map(([name, v]) => ({ name, value: String(v) }));
  return mergeSpecifics(parseSpecifics(draft.specifics), [
    ...(item.brand ? [{ name: "Brand", value: item.brand }] : []),
    ...(item.model ? [{ name: "Model", value: item.model }] : []),
    ...fromAttrs,
  ]);
}

/**
 * Real eBay adapter: OAuth user tokens, Taxonomy → Media → Inventory → publishOffer, Fulfillment
 * orders and Trading Best Offers. Every network call goes through the typed client with ≤2 retries
 * and human error mapping.
 */
export class EbayAdapter implements PhasedAdapter {
  readonly marketplace = "EBAY" as const;

  capabilities(): ConnectionCapabilities {
    return { connect: "oauth", publish: "api", update: "api", end: "api", offers: "api", orders: "api", messages: "none" };
  }

  authorizeUrl(state: string): string {
    return ebayAuthorizeUrl(state);
  }

  async handleCallback(userId: string, code: string): Promise<MarketplaceConnection> {
    const tokens = await exchangeEbayCode(code);
    const identity = await getEbayIdentity(tokens.accessToken);
    const base = {
      status: "CONNECTED" as const,
      mode: "api",
      externalAccountId: identity.userId,
      externalAccountName: identity.username,
      scopes: tokens.scopes.length ? tokens.scopes : EBAY_USER_SCOPES,
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      accessTokenEnc: encryptSecret(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      refreshTokenExpiresAt: tokens.refreshExpiresAt,
      lastError: null,
      connectedAt: new Date(),
    };
    let connection = await db.marketplaceConnection.upsert({
      where: { userId_marketplace: { userId, marketplace: "EBAY" } },
      create: { userId, marketplace: "EBAY", ...base, metadata: { ebay: { username: identity.username } } },
      update: { ...base, metadata: { ebay: { username: identity.username } } },
    });
    // First-connect housekeeping (research §7): programs, policies, location. Failures here are
    // recorded on the connection but never block the connection itself.
    try {
      connection = await this.ensureSellerSetup(connection);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      connection = await db.marketplaceConnection.update({ where: { id: connection.id }, data: { lastError: `Connected, but eBay seller setup is incomplete: ${message}` } });
    }
    return connection;
  }

  /** Opt in to business policies, read/create defaults and make sure an inventory location exists. Idempotent. */
  async ensureSellerSetup(connection: MarketplaceConnection): Promise<MarketplaceConnection> {
    const meta = readEbayMeta(connection);
    if (meta.policies && meta.locationKey) return connection;
    const prefs = await loadSellerPrefs(connection.userId);
    const programs = await getOptedInPrograms(connection);
    if (!programs.includes("SELLING_POLICY_MANAGEMENT")) await optInToProgram(connection, "SELLING_POLICY_MANAGEMENT");
    const policies = meta.policies ?? (await getOrCreateDefaultPolicies(connection, { offersShipping: prefs.offersShipping, offersLocalPickup: prefs.offersLocalPickup }));
    const locationKey = meta.locationKey ?? (await createInventoryLocation(connection, locationOf(prefs)));
    const metadata = { ...((connection.metadata ?? {}) as Record<string, unknown>), ebay: { ...meta, policies, locationKey, programs: [...new Set([...programs, "SELLING_POLICY_MANAGEMENT"])] } };
    return db.marketplaceConnection.update({ where: { id: connection.id }, data: { metadata: metadata as Prisma.InputJsonValue, lastError: null } });
  }

  async disconnect(userId: string): Promise<void> {
    // eBay has no partner-side revocation endpoint; the seller revokes in eBay account settings.
    // We drop every token immediately so Clover can no longer act on their behalf.
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
      feePreview: { fees, net: priceCents - fees, note: `${info.fees.note} Exact fees come from eBay before publishing.` },
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    return this.publishPhased(input, flatRunner(input.report));
  }

  async publishPhased(input: PublishInput, run: StepRunner): Promise<PublishResult> {
    const { item, draft, connection, prepared } = input;
    if (!connection || connection.status !== "CONNECTED") {
      return { status: "NEEDS_ATTENTION", attention: { code: "not_connected", message: "eBay is not connected.", recovery: "Connect eBay from Connections, then publish again." } };
    }
    if (!item.conditionGrade) {
      return { status: "NEEDS_ATTENTION", attention: { code: "condition_missing", message: "eBay requires a condition.", recovery: "Set the condition grade on the item, then publish again.", field: "condition" } };
    }
    if (prepared.priceCents < 99) {
      return { status: "NEEDS_ATTENTION", attention: { code: "price_missing", message: "eBay needs a price of at least $0.99.", recovery: "Set a list price, then publish again.", field: "price" } };
    }
    try {
      const conn = await this.ensureSellerSetup(connection);
      const meta = readEbayMeta(conn);
      const policies = meta.policies!;
      const locationKey = meta.locationKey ?? CLOVER_LOCATION_KEY;

      // 1. Photos → eBay Picture Services.
      const photos = selectListingPhotos(input.photos, MARKETPLACES.EBAY.limits.photosMax);
      if (photos.length === 0) {
        return { status: "NEEDS_ATTENTION", attention: { code: "photos_missing", message: "eBay requires at least one photo.", recovery: "Add a photo to the item, then publish again.", field: "photos" } };
      }
      const imageUrls = await run("photos", `Uploading ${photos.length} photo${photos.length === 1 ? "" : "s"} to eBay`, async (report) => {
        const urls: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i]!;
          await report(`Uploading photo ${i + 1} of ${photos.length} to eBay`);
          const url = await storage.url(p.storageKey, 3600);
          const uploaded = await uploadListingImage(conn, { url, bytes: async () => (await storage.get(p.storageKey)) ?? Buffer.alloc(0), filename: `${item.sku}-${i + 1}.jpg` });
          urls.push(uploaded.imageUrl);
        }
        await report(`Uploaded ${urls.length} photo${urls.length === 1 ? "" : "s"} to eBay`);
        return urls;
      });

      // 2. Category + required item specifics.
      const category = await run("category", "Mapping category and item specifics", async (report) => {
        let categoryId = draft.categoryId;
        let path = draft.categoryPath.length ? draft.categoryPath : item.categoryPath;
        if (!categoryId) {
          const q = [item.brand, item.model, prepared.title].filter(Boolean).join(" ");
          const suggestions = await getCategorySuggestions(q);
          const best = suggestions[0];
          if (!best) throw new EbayApiError("eBay could not suggest a category for this title", 400, [{ message: "invalid category: no suggestion" }], false);
          categoryId = best.categoryId;
          path = best.path;
        }
        const aspects = await getItemAspectsForCategory(categoryId);
        const resolved = resolveAspects(aspects, knownSpecifics(item, draft));
        const requiredCount = aspects.filter((a) => a.required).length;
        await report(`Mapped to ${path.join(" > ") || `category ${categoryId}`}; ${resolved.matchedRequired} of ${requiredCount} required specifics found`, { categoryId, path });
        return { categoryId, path, ...resolved };
      });
      if (category.missing.length) {
        const names = category.missing.map((n) => `'${n}'`).join(", ");
        return { status: "NEEDS_ATTENTION", attention: { code: "aspect_required", message: `eBay requires ${names} for ${category.path[category.path.length - 1] ?? "this category"}.`, recovery: `Add ${names} to the item specifics in the listing, then publish again.`, field: "specifics" } };
      }

      // 3. Inventory item + offer + fee preview.
      const grade = item.conditionGrade;
      const conditionEnum = EBAY_CONDITION_ENUM[grade];
      const conditionDescription = grade === "NEW_SEALED" ? undefined : [draft.conditionText, item.conditionNotes].filter(Boolean).join(" ").trim() || undefined;
      const offer = await run("fees", "Previewing fees", async (report) => {
        await createOrReplaceInventoryItem(conn, {
          sku: item.sku,
          title: prepared.title,
          description: prepared.description,
          aspects: category.aspects,
          imageUrls,
          brand: item.brand ?? undefined,
          mpn: findSpecific(prepared.specifics, "MPN") ?? undefined,
          conditionEnum,
          conditionDescription,
          quantity: Math.max(1, item.quantity),
        });
        const offerInput = {
          sku: item.sku,
          categoryId: category.categoryId,
          priceCents: prepared.priceCents,
          listingDescription: prepared.description.replace(/\n/g, "<br>"),
          merchantLocationKey: locationKey,
          policies,
          bestOffer: { enabled: grade !== "NEW_SEALED", autoDeclineCents: item.floorPrice ? Math.round(item.floorPrice * 0.9) : null },
          quantity: Math.max(1, item.quantity),
        };
        const existing = await getOfferBySku(conn, item.sku);
        let offerId: string;
        if (existing) {
          await updateOffer(conn, existing.offerId, offerInput);
          offerId = existing.offerId;
        } else {
          offerId = (await createOffer(conn, offerInput)).offerId;
        }
        const fees = await getListingFees(conn, [offerId]);
        const fvf = fees.fees.find((f) => /FINAL_VALUE|FinalValue/i.test(f.feeType));
        const parts = fees.fees.map((f) => `${formatMoney(f.amountCents)} ${f.feeType.toLowerCase().replace(/_/g, " ")}`);
        await report(fees.fees.length ? `eBay fee preview: ${fvf ? `${formatMoney(fvf.amountCents)} final value fee` : parts.join(", ")}` : "eBay fee preview: no upfront fees for this listing", { fees: fees.fees, totalCents: fees.totalCents });
        return { offerId, fees };
      });

      // 4. Publish.
      return await run("publish", "Publishing to eBay", async (report) => {
        const { listingId, warnings } = await publishOffer(conn, offer.offerId);
        await report(`Published — item ${listingId}`, { listingId });
        return {
          status: "PUBLISHED" as const,
          externalId: listingId,
          externalUrl: ebayListingUrl(listingId),
          externalMeta: { offerId: offer.offerId, sku: item.sku, categoryId: category.categoryId, categoryPath: category.path, warnings },
          feePreview: { fees: offer.fees.fees, totalCents: offer.fees.totalCents, source: "ebay:getListingFees" },
        };
      });
    } catch (err) {
      return mapEbayError(err);
    }
  }

  async update(input: Parameters<MarketplaceAdapter["update"]>[0]): Promise<PublishResult> {
    const { publication, connection, item } = input;
    if (!connection || connection.status !== "CONNECTED") {
      return { status: "NEEDS_ATTENTION", attention: { code: "not_connected", message: "eBay is not connected.", recovery: "Reconnect eBay from Connections, then try again." } };
    }
    const meta = (publication.externalMeta ?? {}) as { offerId?: string; sku?: string };
    if (!meta.offerId) return { status: "FAILED", error: "This eBay publication has no offer id to update.", retryable: false };
    try {
      await updatePrice(connection, meta.sku ?? item.sku, meta.offerId, input.priceCents);
      return { status: "PUBLISHED", externalId: publication.externalId ?? "", externalUrl: publication.externalUrl, externalMeta: { ...meta, lastPriceUpdateAt: new Date().toISOString() } };
    } catch (err) {
      return mapEbayError(err);
    }
  }

  async end(input: Parameters<MarketplaceAdapter["end"]>[0]): ReturnType<MarketplaceAdapter["end"]> {
    const { publication, connection } = input;
    const meta = (publication.externalMeta ?? {}) as { offerId?: string };
    if (!connection || connection.status !== "CONNECTED") return { status: "FAILED", message: "eBay is not connected, so the listing could not be ended. Reconnect eBay or end it in Seller Hub.", externalUrl: publication.externalUrl };
    if (!meta.offerId) return { status: "FAILED", message: "This eBay publication has no offer id, so Clover cannot end it. End it in Seller Hub.", externalUrl: publication.externalUrl };
    try {
      await withdrawOffer(connection, meta.offerId);
      return { status: "ENDED", externalUrl: publication.externalUrl };
    } catch (err) {
      const mapped = mapEbayError(err);
      const message = mapped.status === "NEEDS_ATTENTION" ? `${mapped.attention.message} ${mapped.attention.recovery}` : mapped.status === "FAILED" ? mapped.error : "eBay could not end the listing.";
      return { status: "FAILED", message, externalUrl: publication.externalUrl };
    }
  }

  async syncOffers(input: { publication: { externalId: string | null }; connection: MarketplaceConnection }): Promise<SyncedOffer[]> {
    if (!input.publication.externalId) return [];
    return getBestOffers(input.connection, input.publication.externalId, "All");
  }

  async respondToOffer(input: Parameters<NonNullable<MarketplaceAdapter["respondToOffer"]>>[0]): Promise<void> {
    if (!input.publication.externalId) throw new Error("This publication has no eBay item id.");
    await respondToBestOffer(input.connection, { itemId: input.publication.externalId, bestOfferId: input.externalOfferId, action: input.action, counterCents: input.counterCents, message: input.message });
  }

  async syncOrders(input: { connection: MarketplaceConnection; since: Date }): Promise<SyncedOrder[]> {
    return getOrders(input.connection, input.since);
  }
}

export type { Photo };
