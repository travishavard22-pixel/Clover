import type { Marketplace, PublicationStatus } from "../db";
import { PUBLICATION_STATUS_META } from "./labels";
import { isMarketplaceId } from "./registry";

/** Client-safe filter parsing for the Listings board (no db/env imports). */
export type ListingFilters = { marketplace: Marketplace | null; status: PublicationStatus | "LIVE" | "ALL"; q: string };

const STATUS_VALUES = new Set<string>(Object.keys(PUBLICATION_STATUS_META));

/** Pure: reads `?marketplace=&status=&q=` into a filter object, ignoring anything unknown. */
export function parseListingFilters(params: URLSearchParams): ListingFilters {
  const mp = params.get("marketplace")?.toUpperCase() ?? "";
  const status = params.get("status")?.toUpperCase() ?? "ALL";
  return {
    marketplace: isMarketplaceId(mp) ? mp : null,
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
