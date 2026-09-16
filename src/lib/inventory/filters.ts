/**
 * Pure list-query helpers: filter → Prisma `where`, sort → `orderBy`, cursor codec and query-string
 * parsing. No database access, so the inventory API's shape is unit-testable.
 */
import type { ItemStatus, Marketplace, Prisma } from "../db";
import type { ListFilters, SortKey } from "./types";
import { SORT_KEYS } from "./types";

export const DEFAULT_LIMIT = 24;
export const MAX_LIMIT = 100;

const ALL_STATUSES: readonly ItemStatus[] = ["DRAFT", "ANALYZING", "READY", "LISTED", "OFFER_RECEIVED", "SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"];
const ALL_MARKETPLACES: readonly Marketplace[] = ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"];

/** Builds the Prisma `where` for a list request. Search terms are AND-ed; each term matches any text field. */
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

/** Sort key → Prisma orderBy, always tie-broken by id so cursor pagination is stable. */
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

export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

/** Decodes a cursor back to an item id; null when the cursor is malformed. */
export function decodeCursorId(cursor: string): string | null {
  let id: string;
  try {
    id = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

/** Parses repeated or comma-separated status params into a validated, de-duplicated list. */
export function parseStatuses(raw: string | string[] | null | undefined): ItemStatus[] {
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((s) => s.split(",")).map((s) => s.trim().toUpperCase());
  const out: ItemStatus[] = [];
  for (const s of list) if ((ALL_STATUSES as readonly string[]).includes(s) && !out.includes(s as ItemStatus)) out.push(s as ItemStatus);
  return out;
}

export function parseMarketplace(raw: string | null | undefined): Marketplace | undefined {
  const v = raw?.trim().toUpperCase();
  return v && (ALL_MARKETPLACES as readonly string[]).includes(v) ? (v as Marketplace) : undefined;
}

export function parseSort(raw: string | null | undefined): SortKey {
  const v = raw?.trim().toLowerCase();
  return v && (SORT_KEYS as readonly string[]).includes(v) ? (v as SortKey) : "newest";
}

/** Reads the full filter set from URL search params (server pages and the route handler share this). */
export function filtersFromSearchParams(sp: URLSearchParams): ListFilters {
  const limit = Number(sp.get("limit") ?? "");
  return {
    q: sp.get("q") ?? undefined,
    status: parseStatuses(sp.getAll("status")),
    marketplace: parseMarketplace(sp.get("marketplace")),
    sort: parseSort(sp.get("sort")),
    cursor: sp.get("cursor"),
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    includeArchived: sp.get("archived") === "1",
  };
}

/** Serialises filters back to search params (the client keeps the URL shareable). */
export function filtersToSearchParams(f: ListFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q?.trim()) sp.set("q", f.q.trim());
  for (const s of f.status ?? []) sp.append("status", s);
  if (f.marketplace) sp.set("marketplace", f.marketplace);
  if (f.sort && f.sort !== "newest") sp.set("sort", f.sort);
  if (f.cursor) sp.set("cursor", f.cursor);
  if (f.limit) sp.set("limit", String(f.limit));
  if (f.includeArchived) sp.set("archived", "1");
  return sp;
}
