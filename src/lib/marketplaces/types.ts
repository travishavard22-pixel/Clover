import type { Item, ListingDraft, MarketplaceConnection, Photo, Publication, PublicationStatus, Marketplace } from "../db";

export type ChecklistStep = { key: string; label: string; done: boolean; href?: string; copyText?: string };

export type PublishResult =
  | { status: "PUBLISHED"; externalId: string; externalUrl: string | null; externalMeta?: Record<string, unknown>; feePreview?: Record<string, unknown> }
  | { status: "REQUIRES_USER_ACTION"; checklist: ChecklistStep[]; externalUrl?: string | null; message: string }
  | { status: "NEEDS_ATTENTION"; attention: { code: string; message: string; recovery: string; field?: string } }
  | { status: "FAILED"; error: string; retryable: boolean };

export type PreparedPublication = {
  title: string;
  description: string;
  priceCents: number;
  conditionLabel: string;
  categoryLabel: string | null;
  specifics: Array<{ name: string; value: string }>;
  photoUrls: string[];
  warnings: string[];
  feePreview: { fees: number; net: number; note: string };
};

export type SyncedOffer = {
  externalId: string;
  buyerName: string;
  buyerId: string | null;
  amountCents: number;
  message: string | null;
  receivedAt: Date;
  expiresAt: Date | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "COUNTERED" | "EXPIRED";
};

export type SyncedOrder = { externalOrderId: string; externalListingId: string; salePriceCents: number; feesCents: number | null; buyerName: string | null; soldAt: Date };

export type ConnectionCapabilities = {
  connect: "oauth" | "none";
  publish: "api" | "assisted";
  update: "api" | "assisted";
  end: "api" | "assisted";
  offers: "api" | "manual";
  orders: "api" | "manual";
  messages: "api" | "none";
};

export interface MarketplaceAdapter {
  readonly marketplace: Marketplace;
  capabilities(): ConnectionCapabilities;
  /** OAuth start URL (or null for assisted-only marketplaces). */
  authorizeUrl?(state: string): string;
  /** Exchange an OAuth code and persist the connection. */
  handleCallback?(userId: string, code: string): Promise<MarketplaceConnection>;
  disconnect(userId: string): Promise<void>;
  /** Build the marketplace-specific payload and preview from our canonical draft. */
  prepare(input: { item: Item; draft: ListingDraft; photos: Photo[]; connection: MarketplaceConnection | null; photoUrl: (p: Photo, expires: number) => Promise<string> }): Promise<PreparedPublication>;
  publish(input: { publication: Publication; item: Item; draft: ListingDraft; photos: Photo[]; connection: MarketplaceConnection | null; prepared: PreparedPublication; report: (msg: string) => Promise<void> }): Promise<PublishResult>;
  update(input: { publication: Publication; item: Item; draft: ListingDraft; connection: MarketplaceConnection | null; priceCents: number }): Promise<PublishResult>;
  end(input: { publication: Publication; connection: MarketplaceConnection | null; reason: "sold_elsewhere" | "withdrawn" }): Promise<{ status: Extract<PublicationStatus, "ENDED" | "REQUIRES_USER_ACTION" | "FAILED">; message?: string; externalUrl?: string | null }>;
  syncOffers?(input: { publication: Publication; connection: MarketplaceConnection }): Promise<SyncedOffer[]>;
  respondToOffer?(input: { publication: Publication; connection: MarketplaceConnection; externalOfferId: string; action: "accept" | "decline" | "counter"; counterCents?: number; message?: string }): Promise<void>;
  syncOrders?(input: { connection: MarketplaceConnection; since: Date }): Promise<SyncedOrder[]>;
}
