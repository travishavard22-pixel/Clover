import { getOwnedItemFull } from "../items/access";
import { toPhotoDTO, type PhotoDTO } from "../items/dto";
import type { ItemProfile } from "../ai/schemas";
import type { ConfidenceTier, EstimateBasis, Marketplace, OfferStatus } from "../db";
import { daysOnMarket, estimatedProfit, realisedProfit } from "./compute";
import type { ItemListDTO, PublicationSummary } from "./types";

export type ItemDetailDTO = ItemListDTO & {
  photos: PhotoDTO[];
  profile: { data: ItemProfile; identityConfidence: number; conditionConfidence: number; provider: string; model: string; updatedAt: string } | null;
  estimateDetail: {
    basis: EstimateBasis;
    confidence: ConfidenceTier;
    quickSale: number;
    recommended: number;
    maxValue: number;
    low: number;
    likely: number;
    high: number;
    compsUsed: number;
    explanation: string;
    updatedAt: string;
  } | null;
  drafts: Array<{ id: string; marketplace: Marketplace | null; title: string; price: number | null; version: number; updatedAt: string }>;
  publicationDetails: Array<PublicationSummary & { price: number | null; publishedAt: string | null; attention: { code?: string; message?: string; recovery?: string } | null; lastError: string | null }>;
  offers: Array<{ id: string; marketplace: Marketplace; buyerName: string; amount: number; originalPrice: number; status: OfferStatus; receivedAt: string; expiresAt: string | null }>;
};

/** Everything the quick-edit sheet and the item API need for one item. */
export async function getItemDetail(userId: string, itemId: string, now = new Date()): Promise<ItemDetailDTO> {
  const i = await getOwnedItemFull(userId, itemId);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const cover = i.photos[0];
  const publications: PublicationSummary[] = i.publications.map((p) => ({ id: p.id, marketplace: p.marketplace, mode: p.mode, status: p.status, externalUrl: p.externalUrl }));
  const coverDto = cover ? toPhotoDTO(cover) : null;
  return {
    id: i.id,
    sku: i.sku,
    title: i.title,
    status: i.status,
    brand: i.brand,
    model: i.model,
    categoryPath: i.categoryPath,
    conditionGrade: i.conditionGrade,
    conditionNotes: i.conditionNotes,
    attributes: (i.attributes ?? {}) as Record<string, unknown>,
    acquisitionCost: i.acquisitionCost,
    estimatedValue: i.estimatedValue,
    listPrice: i.listPrice,
    floorPrice: i.floorPrice,
    soldPrice: i.soldPrice,
    fees: i.fees,
    shippingCost: i.shippingCost,
    soldMarketplace: i.soldMarketplace,
    storageLocation: i.storageLocation,
    notes: i.notes,
    quantity: i.quantity,
    acquiredAt: iso(i.acquiredAt),
    listedAt: iso(i.listedAt),
    soldAt: iso(i.soldAt),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    cover: cover && coverDto ? { id: cover.id, url: coverDto.url, thumbUrl: coverDto.thumbUrl, width: cover.width, height: cover.height, aiGenerated: cover.aiGenerated } : null,
    photoCount: i.photos.length,
    publications,
    pendingOffers: i.offers.length,
    estimate: i.estimate ? { basis: i.estimate.basis, confidence: i.estimate.confidence, recommended: i.estimate.recommended } : null,
    daysOnMarket: daysOnMarket(i, now),
    profit: realisedProfit(i),
    estimatedProfit: estimatedProfit(i),
    photos: i.photos.map((p) => toPhotoDTO(p)),
    profile: i.profile
      ? { data: i.profile.data as ItemProfile, identityConfidence: i.profile.identityConfidence, conditionConfidence: i.profile.conditionConfidence, provider: i.profile.provider, model: i.profile.model, updatedAt: i.profile.updatedAt.toISOString() }
      : null,
    estimateDetail: i.estimate
      ? {
          basis: i.estimate.basis,
          confidence: i.estimate.confidence,
          quickSale: i.estimate.quickSale,
          recommended: i.estimate.recommended,
          maxValue: i.estimate.maxValue,
          low: i.estimate.low,
          likely: i.estimate.likely,
          high: i.estimate.high,
          compsUsed: i.estimate.compsUsed,
          explanation: i.estimate.explanation,
          updatedAt: i.estimate.updatedAt.toISOString(),
        }
      : null,
    drafts: i.drafts.map((d) => ({ id: d.id, marketplace: d.marketplace, title: d.title, price: d.price, version: d.version, updatedAt: d.updatedAt.toISOString() })),
    publicationDetails: i.publications.map((p) => ({
      id: p.id,
      marketplace: p.marketplace,
      mode: p.mode,
      status: p.status,
      externalUrl: p.externalUrl,
      price: p.price,
      publishedAt: iso(p.publishedAt),
      attention: (p.attention ?? null) as { code?: string; message?: string; recovery?: string } | null,
      lastError: p.lastError,
    })),
    offers: i.offers.map((o) => ({ id: o.id, marketplace: o.marketplace, buyerName: o.buyerName, amount: o.amount, originalPrice: o.originalPrice, status: o.status, receivedAt: o.receivedAt.toISOString(), expiresAt: iso(o.expiresAt) })),
  };
}
