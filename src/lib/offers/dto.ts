import type { Marketplace, Offer, OfferStatus, Publication, PublicationStatus } from "../db";
import { signedFileUrl } from "../storage";
import { marketplaceMode } from "../marketplaces/mode";
import { MARKETPLACES } from "../marketplaces/registry";
import { LIVE_STATUSES } from "../marketplaces/sales";
import type { ConnectionMode } from "../marketplaces/labels";
import { offerMath, type OfferMath } from "./decision";

export type OfferSuggestion = {
  recommendation: "accept" | "counter" | "decline";
  counterAmountCents: number | null;
  reasoning: string;
  suggestedMessage: string;
  source: "ai" | "rules";
  provider: string;
  model: string | null;
  generatedAt: string;
  inputs: { feeRate: number; daysListed: number };
};

export type OfferDTO = {
  id: string;
  status: OfferStatus;
  marketplace: Marketplace;
  marketplaceName: string;
  marketplaceShortName: string;
  marketplaceColor: string;
  mode: ConnectionMode;
  /** True when the reply must happen on the marketplace itself (assisted channels or manual entries). */
  manualReply: boolean;
  buyerName: string;
  amount: number;
  originalPrice: number;
  message: string | null;
  counterAmount: number | null;
  responseMessage: string | null;
  receivedAt: string;
  expiresAt: string | null;
  respondedAt: string | null;
  externalId: string | null;
  isDemo: boolean;
  item: { id: string; sku: string; title: string; status: string; listPrice: number | null; floorPrice: number | null; acquisitionCost: number | null; listedAt: string | null; cover: { url: string; thumbUrl: string } | null };
  publication: { id: string; status: PublicationStatus; externalUrl: string | null; mode: Publication["mode"] } | null;
  math: OfferMath;
  suggestion: OfferSuggestion | null;
  /** Live publications on other marketplaces that the double-sell guard will act on if this offer is accepted. */
  otherLivePublications: Array<{ id: string; marketplace: Marketplace; name: string; mode: Publication["mode"]; externalUrl: string | null; automatic: boolean }>;
};

export type OfferRecord = Offer & {
  item: { id: string; sku: string; title: string; status: string; listPrice: number | null; floorPrice: number | null; acquisitionCost: number | null; listedAt: Date | null; photos: Array<{ storageKey: string; thumbKey: string | null }>; publications: Array<Pick<Publication, "id" | "marketplace" | "mode" | "status" | "externalUrl">> };
  publication: Pick<Publication, "id" | "status" | "externalUrl" | "mode"> | null;
};

export function parseSuggestion(json: unknown): OfferSuggestion | null {
  if (!json || typeof json !== "object") return null;
  const s = json as Partial<OfferSuggestion>;
  if (s.recommendation !== "accept" && s.recommendation !== "counter" && s.recommendation !== "decline") return null;
  return {
    recommendation: s.recommendation,
    counterAmountCents: typeof s.counterAmountCents === "number" ? s.counterAmountCents : null,
    reasoning: String(s.reasoning ?? ""),
    suggestedMessage: String(s.suggestedMessage ?? ""),
    source: s.source === "ai" ? "ai" : "rules",
    provider: String(s.provider ?? "rules"),
    model: typeof s.model === "string" ? s.model : null,
    generatedAt: String(s.generatedAt ?? ""),
    inputs: { feeRate: Number(s.inputs?.feeRate ?? 0), daysListed: Number(s.inputs?.daysListed ?? 0) },
  };
}

export function toOfferDTO(o: OfferRecord): OfferDTO {
  const info = MARKETPLACES[o.marketplace];
  const mode = marketplaceMode(o.marketplace);
  const cover = o.item.photos[0];
  const ttl = 6 * 3600;
  const isDemo = mode === "demo" || (o.externalId?.startsWith("demo-") ?? false);
  const apiReply = o.publication?.mode === "API" && !!o.externalId && mode !== "assisted";
  const others = o.item.publications
    .filter((p) => p.id !== o.publicationId && p.marketplace !== o.marketplace && LIVE_STATUSES.has(p.status))
    .map((p) => ({ id: p.id, marketplace: p.marketplace, name: MARKETPLACES[p.marketplace].name, mode: p.mode, externalUrl: p.externalUrl, automatic: p.mode === "API" && marketplaceMode(p.marketplace) !== "assisted" }));
  return {
    id: o.id,
    status: o.status,
    marketplace: o.marketplace,
    marketplaceName: info.name,
    marketplaceShortName: info.shortName,
    marketplaceColor: info.color,
    mode,
    manualReply: !apiReply,
    buyerName: o.buyerName,
    amount: o.amount,
    originalPrice: o.originalPrice,
    message: o.message,
    counterAmount: o.counterAmount,
    responseMessage: o.responseMessage,
    receivedAt: o.receivedAt.toISOString(),
    expiresAt: o.expiresAt?.toISOString() ?? null,
    respondedAt: o.respondedAt?.toISOString() ?? null,
    externalId: o.externalId,
    isDemo,
    item: {
      id: o.item.id,
      sku: o.item.sku,
      title: o.item.title,
      status: o.item.status,
      listPrice: o.item.listPrice,
      floorPrice: o.item.floorPrice,
      acquisitionCost: o.item.acquisitionCost,
      listedAt: o.item.listedAt?.toISOString() ?? null,
      cover: cover ? { url: signedFileUrl(cover.storageKey, ttl, false), thumbUrl: signedFileUrl(cover.thumbKey ?? cover.storageKey, ttl, false) } : null,
    },
    publication: o.publication ? { id: o.publication.id, status: o.publication.status, externalUrl: o.publication.externalUrl, mode: o.publication.mode } : null,
    math: offerMath({ amountCents: o.amount, originalPriceCents: o.originalPrice, marketplace: o.marketplace, acquisitionCostCents: o.item.acquisitionCost }),
    suggestion: parseSuggestion(o.suggestion),
    otherLivePublications: others,
  };
}

export const offerInclude = {
  item: { select: { id: true, sku: true, title: true, status: true, listPrice: true, floorPrice: true, acquisitionCost: true, listedAt: true, photos: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { storageKey: true, thumbKey: true } }, publications: { select: { id: true, marketplace: true, mode: true, status: true, externalUrl: true } } } },
  publication: { select: { id: true, status: true, externalUrl: true, mode: true } },
} as const;

/** Pending first (newest on top), then everything else newest first. */
export function sortOffers<T extends { status: OfferStatus; receivedAt: Date }>(offers: T[]): T[] {
  const rank = (s: OfferStatus) => (s === "PENDING" ? 0 : s === "COUNTERED" ? 1 : 2);
  return [...offers].sort((a, b) => rank(a.status) - rank(b.status) || b.receivedAt.getTime() - a.receivedAt.getTime());
}
