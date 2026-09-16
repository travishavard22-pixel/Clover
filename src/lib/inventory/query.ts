import { db, Prisma } from "../db";
import { ApiError } from "../api";
import { signedFileUrl } from "../storage";
import { daysOnMarket, estimatedProfit, realisedProfit } from "./compute";
import type { CoverPhoto, ItemListDTO, ListFilters, ListResult } from "./types";
import { buildOrderBy, buildWhere, clampLimit, decodeCursorId, encodeCursor } from "./filters";

const listInclude = {
  photos: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { id: true, storageKey: true, thumbKey: true, width: true, height: true, aiGenerated: true } },
  _count: { select: { photos: true, offers: { where: { status: "PENDING" as const } } } },
  publications: { select: { id: true, marketplace: true, mode: true, status: true, externalUrl: true }, orderBy: { createdAt: "asc" as const } },
  estimate: { select: { basis: true, confidence: true, recommended: true } },
} satisfies Prisma.ItemInclude;

export type ListItemRecord = Prisma.ItemGetPayload<{ include: typeof listInclude }>;

export function toCover(p: { id: string; storageKey: string; thumbKey: string | null; width: number; height: number; aiGenerated: boolean } | undefined): CoverPhoto | null {
  if (!p) return null;
  const ttl = 60 * 60 * 6;
  return { id: p.id, url: signedFileUrl(p.storageKey, ttl, false), thumbUrl: signedFileUrl(p.thumbKey ?? p.storageKey, ttl, false), width: p.width, height: p.height, aiGenerated: p.aiGenerated };
}

export function toItemListDTO(i: ListItemRecord, now = new Date()): ItemListDTO {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
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
    cover: toCover(i.photos[0]),
    photoCount: i._count.photos,
    publications: i.publications,
    pendingOffers: i._count.offers,
    estimate: i.estimate,
    daysOnMarket: daysOnMarket(i, now),
    profit: realisedProfit(i),
    estimatedProfit: estimatedProfit(i),
  };
}

export async function listItems(userId: string, filters: ListFilters): Promise<ListResult> {
  const limit = clampLimit(filters.limit);
  const cursor = filters.cursor ? decodeCursorId(filters.cursor) : null;
  if (filters.cursor && !cursor) throw new ApiError(400, "Invalid cursor", "bad_cursor");
  const rows = await db.item.findMany({
    where: buildWhere(userId, filters),
    orderBy: buildOrderBy(filters.sort),
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: listInclude,
  });
  const page = rows.slice(0, limit);
  const now = new Date();
  return { items: page.map((r) => toItemListDTO(r, now)), nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!.id) : null };
}

export async function getItemListDTO(userId: string, itemId: string): Promise<ItemListDTO> {
  const row = await db.item.findFirst({ where: { id: itemId, userId }, include: listInclude });
  if (!row) throw new ApiError(404, "Item not found", "not_found");
  return toItemListDTO(row);
}
