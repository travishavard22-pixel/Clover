import { createHash } from "node:crypto";
import { estimateFees } from "../registry";

/**
 * Pure, deterministic helpers for the Demo eBay adapter. Everything is derived from stable ids so
 * repeated syncs are idempotent and unit tests can assert exact values. Nothing here touches the
 * network or the database.
 */
export const DEMO_ACCOUNT_PREFIX = "demo-user-";
export const DEMO_LISTING_PREFIX = "demo-ebay-";
export const DEMO_OFFER_PREFIX = "demo-offer-";
export const DEMO_ORDER_PREFIX = "demo-order-";

function digest(seed: string): Buffer {
  return createHash("sha256").update(seed).digest();
}

/** A 12-digit, eBay-looking numeric id derived from a publication id. */
export function demoListingNumber(publicationId: string): string {
  const hex = digest(`listing:${publicationId}`).subarray(0, 8).readBigUInt64BE();
  return (hex % 900_000_000_000n + 100_000_000_000n).toString();
}

export function demoListingId(publicationId: string): string {
  return `${DEMO_LISTING_PREFIX}${demoListingNumber(publicationId)}`;
}

export function demoListingUrl(publicationId: string): string {
  return `https://www.ebay.com/itm/${demoListingNumber(publicationId)}`;
}

export function isDemoListingId(externalId: string | null | undefined): boolean {
  return !!externalId && externalId.startsWith(DEMO_LISTING_PREFIX);
}

export function demoAccount(userId: string, displayName: string): { externalAccountId: string; externalAccountName: string } {
  const suffix = digest(`account:${userId}`).toString("hex").slice(0, 8);
  const handle = displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 14) || "seller";
  return { externalAccountId: `${DEMO_ACCOUNT_PREFIX}${suffix}`, externalAccountName: `${handle}_${suffix.slice(0, 4)}` };
}

/** Fee preview matching the shape of eBay's getListingFees, labelled as an estimate. */
export function demoFeePreview(priceCents: number) {
  const fvf = estimateFees("EBAY", priceCents);
  return { fees: [{ feeType: "FINAL_VALUE_FEE", amountCents: fvf }], totalCents: fvf, source: "demo:estimate", estimated: true };
}

/** Categories where the demo insists on a Brand, so the attention flow is exercised realistically. */
const BRAND_REQUIRED = /(camera|electronic|phone|computer|laptop|tablet|clothing|shoes|sneaker|watch|audio|gaming|console)/i;

export function demoRequiredAspects(categoryPath: string[]): string[] {
  return categoryPath.some((s) => BRAND_REQUIRED.test(s)) ? ["Brand"] : [];
}

const BUYERS = ["jordan_k", "mia.reads", "tomas_v", "priya.s", "the_gear_den", "kevin_m88", "anna_lisboa", "dev.collects"];
const MESSAGES = [
  "Would you take {amount}? I can pay today.",
  "Hi! Is {amount} okay? Happy to pick up this week.",
  "Interested — offering {amount}. Does it come with everything in the photos?",
  "{amount} and I'll buy it right now.",
  null,
];

export type DemoOffer = { externalId: string; buyerName: string; buyerId: string; amountCents: number; message: string | null; receivedAt: Date; expiresAt: Date };

/**
 * A plausible buyer offer for a published demo listing: 72–90% of the asking price, from a stable
 * pseudonymous buyer, received shortly after publishing (never in the future).
 */
export function demoOfferFor(input: { publicationId: string; priceCents: number; publishedAt: Date; now?: Date }): DemoOffer {
  const now = input.now ?? new Date();
  const h = digest(`offer:${input.publicationId}`);
  const ratio = 0.72 + (h[0]! / 255) * 0.18;
  const raw = Math.round((input.priceCents * ratio) / 100) * 100;
  const amountCents = Math.max(100, Math.min(input.priceCents - 100, raw || input.priceCents - 100));
  const buyerName = BUYERS[h[1]! % BUYERS.length]!;
  const template = MESSAGES[h[2]! % MESSAGES.length];
  const delayMs = (1 + (h[3]! % 6)) * 3600_000;
  const receivedAt = new Date(Math.min(now.getTime(), input.publishedAt.getTime() + delayMs));
  return {
    externalId: `${DEMO_OFFER_PREFIX}${input.publicationId}`,
    buyerName,
    buyerId: `${buyerName}#${h.toString("hex").slice(4, 10)}`,
    amountCents,
    message: template ? template.replace("{amount}", `$${(amountCents / 100).toFixed(0)}`) : null,
    receivedAt,
    expiresAt: new Date(receivedAt.getTime() + 48 * 3600_000),
  };
}

export function demoOrderId(offerId: string): string {
  return `${DEMO_ORDER_PREFIX}${digest(`order:${offerId}`).toString("hex").slice(0, 10)}`;
}
