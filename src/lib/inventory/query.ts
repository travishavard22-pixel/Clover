import { db, Prisma, type ItemStatus, type Marketplace } from "../db";
import { ApiError } from "../api";
import { signedFileUrl } from "../storage";
import { daysOnMarket, estimatedProfit, realisedProfit } from "./compute";
import type { CoverPhoto, ItemListDTO, ListFilters, ListResult, SortKey } from "./types";

export const DEFAULT_LIMIT = 24;
export const MAX_LIMIT = 100;

/** Pure: builds the Prisma `where` for a list request. Exported for tests. */
export function buildWhere(userId: string, f: ListFilters): Prisma.ItemWhereInput {
  const and: Prisma.ItemWhereInput[] = [{ userId }];
  const statuses = (f.status ?? []).filter(Boolean);
  if (statuses.length) and.push({ status: { in: statuses } });
  else if (!f.includeArchived) and.push({ status: { not: "ARCHIVED" } });

  const q = f.q?.trim();
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const term of terms) {
      and.push({
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { brand: { contains: term, mode: "insensitive" } },
          { model: { contains: term, mode: "insensitive" } },
          { sku: { contains: term, mode: "insensitive" } },
          { storageLocation: { contains: term, mode: "insensitive" } },
        ],
      });
    }
  }
  if (f.marketplace) {
    and.push({ OR: [{ publications: { some: { marketplace: f.marketplace } } }, { soldMarketplace: f.marketplace }] });
  }
  return and.length === 1 ? and[0]! : { AND: and };
}

/** Pure: sort key → Prisma orderBy, always tie-broken by id so cursor pagination is stable. */
export function buildOrderBy(sort: SortKey = "newest"): Prisma.ItemOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ listPrice: { sort: "desc", nulls: "last" } }, { id: "desc" }];
    case "price_asc":
      return [{ listPrice: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "days_on_market":
      return [{ listedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "estimated_value":
      return [{ estimatedValue: { sort: "desc", nulls: "last" } }, { id: "desc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

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
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;
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

export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}
export function decodeCursor(cursor: string): string {
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) throw new ApiError(400, "Invalid cursor", "bad_cursor");
  return id;
}

/** Parses repeated/comma-separated status params into a validated list. */
export function parseStatuses(raw: string | string[] | undefined): ItemStatus[] {
  const all = new Set<string>(["DRAFT", "ANALYZING", "READY", "LISTED", "OFFER_RECEIVED", "SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"]);
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((s) => s.split(",")).map((s) => s.trim().toUpperCase());
  return list.filter((s): s is ItemStatus => all.has(s));
}

export function parseMarketplace(raw: string | undefined): Marketplace | undefined {
  const all = new Set<string>(["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"]);
  const v = raw?.trim().toUpperCase();
  return v && all.has(v) ? (v as Marketplace) : undefined;
}
