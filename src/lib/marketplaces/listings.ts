import { db, type Marketplace, type PublicationStatus } from "../db";
import { toPhotoDTO, type PhotoDTO } from "../items/dto";
import { visiblePhotos } from "../photos/order";
import { isMarketplace } from "./index";
import { daysSince, PUBLICATION_STATUS_META } from "./labels";
import { MARKETPLACES } from "./registry";
import { latestPublishJobsForUser, toPublicationDTO, type PublicationDTO } from "./publications";

/** A publication row on the Listings board: the publication plus what it needs from its item. */
export type ListingDTO = {
  publication: PublicationDTO;
  item: { id: string; sku: string; title: string; status: string; listPrice: number | null; cover: PhotoDTO | null; pendingOffers: number };
  marketplace: { id: Marketplace; name: string; shortName: string; color: string };
  statusLabel: string;
  daysLive: number | null;
};

export type ListingFilters = { marketplace: Marketplace | null; status: PublicationStatus | "LIVE" | "ALL"; q: string };

const STATUS_VALUES = new Set<string>(Object.keys(PUBLICATION_STATUS_META));

/** Pure: reads `?marketplace=&status=&q=` into a filter object, ignoring anything unknown. */
export function parseListingFilters(params: URLSearchParams): ListingFilters {
  const mp = params.get("marketplace")?.toUpperCase() ?? "";
  const status = params.get("status")?.toUpperCase() ?? "ALL";
  return {
    marketplace: isMarketplace(mp) ? mp : null,
    status: status === "LIVE" || status === "ALL" ? status : STATUS_VALUES.has(status) ? (status as PublicationStatus) : "ALL",
    q: (params.get("q") ?? "").trim().slice(0, 120),
  };
}

export function listingFiltersToQuery(f: ListingFilters): string {
  const p = new URLSearchParams();
  if (f.marketplace) p.set("marketplace", f.marketplace.toLowerCase());
  if (f.status !== "ALL") p.set("status", f.status.toLowerCase());
  if (f.q) p.set("q", f.q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const LIVE_BOARD_STATUSES: PublicationStatus[] = ["PUBLISHED", "REQUIRES_USER_ACTION", "NEEDS_ATTENTION", "PUBLISHING", "READY"];

/** Every publication across the seller's items, newest activity first, with the item's cover photo. */
export async function listPublications(userId: string, filters: ListingFilters): Promise<ListingDTO[]> {
  const rows = await db.publication.findMany({
    where: {
      userId,
      ...(filters.marketplace ? { marketplace: filters.marketplace } : {}),
      ...(filters.status === "LIVE" ? { status: { in: LIVE_BOARD_STATUSES } } : filters.status !== "ALL" ? { status: filters.status } : {}),
      ...(filters.q ? { item: { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { sku: { contains: filters.q, mode: "insensitive" } }] } } : {}),
    },
    include: { item: { include: { photos: true, offers: { where: { status: "PENDING" }, select: { id: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const jobs = await latestPublishJobsForUser(userId);
  return rows.map((p) => {
    const photos = visiblePhotos(p.item.photos);
    const info = MARKETPLACES[p.marketplace];
    const cover = photos[0] ? toPhotoDTO(photos[0]) : null;
    return {
      publication: toPublicationDTO(p, jobs.get(p.id)),
      item: { id: p.item.id, sku: p.item.sku, title: p.item.title, status: p.item.status, listPrice: p.item.listPrice, cover, pendingOffers: p.item.offers.length },
      marketplace: { id: p.marketplace, name: info.name, shortName: info.shortName, color: info.color },
      statusLabel: PUBLICATION_STATUS_META[p.status].label,
      daysLive: p.status === "PUBLISHED" || p.status === "SOLD" || p.status === "ENDED" ? daysSince(p.publishedAt, p.endedAt ?? new Date()) : null,
    };
  });
}
