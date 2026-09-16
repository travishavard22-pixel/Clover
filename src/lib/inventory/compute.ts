/**
 * Pure inventory arithmetic. No database access so it can be unit-tested and shared with the
 * client. Money is integer cents; dates are Date instances.
 */
import type { ItemStatus, Marketplace } from "../db";
import { roundToPricePoint } from "../money";

export const DAY_MS = 86_400_000;

export const SOLD_STATUSES: readonly ItemStatus[] = ["SOLD", "SHIPPED", "COMPLETED"];
export const ON_MARKET_STATUSES: readonly ItemStatus[] = ["LISTED", "OFFER_RECEIVED"];

export function isSoldStatus(status: ItemStatus): boolean {
  return SOLD_STATUSES.includes(status);
}

/** Whole days between two instants, never negative. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

/**
 * Days an item has been on the market. Counts from `listedAt` to `soldAt` when sold, otherwise to
 * now. Null when the item was never listed.
 */
export function daysOnMarket(item: { listedAt: Date | null; soldAt: Date | null; status: ItemStatus }, now = new Date()): number | null {
  if (!item.listedAt) return null;
  const end = isSoldStatus(item.status) && item.soldAt ? item.soldAt : now;
  return daysBetween(item.listedAt, end);
}

export type ProfitInput = {
  status: ItemStatus;
  soldPrice: number | null;
  fees: number | null;
  shippingCost: number | null;
  acquisitionCost: number | null;
  estimatedValue: number | null;
  listPrice: number | null;
};

/** Realised profit: soldPrice − fees − shippingCost − acquisitionCost. Null unless the item is sold with a price. */
export function realisedProfit(item: ProfitInput): number | null {
  if (!isSoldStatus(item.status) || item.soldPrice === null) return null;
  return item.soldPrice - (item.fees ?? 0) - (item.shippingCost ?? 0) - (item.acquisitionCost ?? 0);
}

/**
 * Estimated profit for unsold items: estimatedValue (or listPrice as a fallback) minus what was
 * paid. Explicitly an estimate — the UI labels it as such.
 */
export function estimatedProfit(item: ProfitInput): number | null {
  if (isSoldStatus(item.status)) return null;
  const basis = item.estimatedValue ?? item.listPrice;
  if (basis === null) return null;
  return basis - (item.acquisitionCost ?? 0);
}

// ─── Batch reprice ───

export type RepriceParams = { mode: "absolute"; cents: number } | { mode: "percent"; percent: number; round?: boolean };

/**
 * Applies a reprice to a list price. Percent mode changes by the given percentage (negative to
 * lower) and optionally snaps to a marketplace-friendly price point. Never goes below the floor
 * price when one is set, and never below $1.
 */
export function applyReprice(listPrice: number | null, floorPrice: number | null, params: RepriceParams): number | null {
  if (params.mode === "absolute") return clampPrice(Math.round(params.cents), floorPrice);
  if (listPrice === null) return null;
  const raw = Math.round(listPrice * (1 + params.percent / 100));
  const next = params.round === false ? raw : roundToPricePoint(raw);
  return clampPrice(next, floorPrice);
}

function clampPrice(cents: number, floorPrice: number | null): number {
  const min = Math.max(100, floorPrice ?? 0);
  return Math.max(min, cents);
}

// ─── Metrics ───

export type MetricItemRow = {
  id: string;
  status: ItemStatus;
  createdAt: Date;
  listedAt: Date | null;
  soldAt: Date | null;
  soldPrice: number | null;
  soldMarketplace: Marketplace | null;
  fees: number | null;
  shippingCost: number | null;
  acquisitionCost: number | null;
  estimatedValue: number | null;
  listPrice: number | null;
};

export type MetricPublicationRow = { itemId: string; marketplace: Marketplace; status: string };

export type SeriesPoint = { date: string; revenue: number; listed: number; sold: number };

export type MarketplaceStat = { marketplace: Marketplace; revenue: number; sold: number; active: number; sellThrough: number };

export type StatusCount = { status: ItemStatus; count: number };

export type InventoryMetrics = {
  activeListings: number;
  sold30d: number;
  soldAll: number;
  revenue30d: number;
  revenueAll: number;
  inventoryValueEstimate: number;
  realisedProfit: number;
  realisedProfit30d: number;
  avgDaysToSale: number | null;
  medianDaysToSale: number | null;
  bestByRevenue: MarketplaceStat | null;
  bestBySellThrough: MarketplaceStat | null;
  marketplaces: MarketplaceStat[];
  drafts: number;
  ready: number;
  shouldReprice: number;
  series: SeriesPoint[];
  statusBreakdown: StatusCount[];
  daysToSale: number[];
  /** Compared with the previous 30-day window; null when there is nothing to compare against. */
  deltas: { sold30d: number | null; revenue30d: number | null };
};

export const STATUS_ORDER: ItemStatus[] = ["DRAFT", "ANALYZING", "READY", "LISTED", "OFFER_RECEIVED", "SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"];

const ACTIVE_PUBLICATION_STATUSES = new Set(["PUBLISHED", "REQUIRES_USER_ACTION", "NEEDS_ATTENTION", "PUBLISHING"]);

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Aggregates rows into dashboard numbers. `now` is injectable for deterministic tests. */
export function computeMetrics(
  items: MetricItemRow[],
  publications: MetricPublicationRow[],
  opts: { now?: Date; days?: number; staleAfterDays?: number; itemsWithOffers?: Set<string> } = {},
): InventoryMetrics {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 90;
  const staleAfter = opts.staleAfterDays ?? 14;
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since60 = new Date(now.getTime() - 60 * DAY_MS);
  const withOffers = opts.itemsWithOffers ?? new Set<string>();

  const sold = items.filter((i) => isSoldStatus(i.status) && i.soldPrice !== null);
  const sold30 = sold.filter((i) => i.soldAt && i.soldAt >= since30);
  const soldPrev30 = sold.filter((i) => i.soldAt && i.soldAt >= since60 && i.soldAt < since30);
  const sum = (rows: MetricItemRow[], f: (r: MetricItemRow) => number | null) => rows.reduce((acc, r) => acc + (f(r) ?? 0), 0);

  const activeListings = items.filter((i) => ON_MARKET_STATUSES.includes(i.status)).length;
  const inventoryValueEstimate = sum(
    items.filter((i) => !isSoldStatus(i.status) && i.status !== "ARCHIVED"),
    (i) => i.estimatedValue ?? i.listPrice,
  );

  const daysToSale = sold
    .filter((i) => i.listedAt && i.soldAt)
    .map((i) => daysBetween(i.listedAt!, i.soldAt!))
    .sort((a, b) => a - b);
  const avgDaysToSale = daysToSale.length ? Math.round((daysToSale.reduce((a, b) => a + b, 0) / daysToSale.length) * 10) / 10 : null;
  const medianDaysToSale = daysToSale.length ? daysToSale[Math.floor((daysToSale.length - 1) / 2)]! : null;

  // Per-marketplace performance
  const perMarket = new Map<Marketplace, MarketplaceStat>();
  const stat = (m: Marketplace) => {
    let s = perMarket.get(m);
    if (!s) {
      s = { marketplace: m, revenue: 0, sold: 0, active: 0, sellThrough: 0 };
      perMarket.set(m, s);
    }
    return s;
  };
  for (const i of sold) {
    if (!i.soldMarketplace) continue;
    const s = stat(i.soldMarketplace);
    s.revenue += i.soldPrice ?? 0;
    s.sold += 1;
  }
  for (const p of publications) {
    if (ACTIVE_PUBLICATION_STATUSES.has(p.status)) stat(p.marketplace).active += 1;
  }
  for (const s of perMarket.values()) {
    const denom = s.sold + s.active;
    s.sellThrough = denom ? Math.round((s.sold / denom) * 1000) / 1000 : 0;
  }
  const marketplaces = [...perMarket.values()].sort((a, b) => b.revenue - a.revenue || b.sold - a.sold);
  const bestByRevenue = marketplaces.find((m) => m.revenue > 0) ?? null;
  const bestBySellThrough = [...marketplaces].filter((m) => m.sold > 0).sort((a, b) => b.sellThrough - a.sellThrough || b.sold - a.sold)[0] ?? null;

  // Stale: listed longer than the threshold with no offers ever received
  const shouldReprice = items.filter((i) => i.status === "LISTED" && i.listedAt && daysBetween(i.listedAt, now) > staleAfter && !withOffers.has(i.id)).length;

  // Daily series for the trailing window
  const series: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now.getTime() - d * DAY_MS);
    const key = isoDay(day);
    const point = { date: key, revenue: 0, listed: 0, sold: 0 };
    series.push(point);
    index.set(key, point);
  }
  for (const i of items) {
    const created = index.get(isoDay(i.createdAt));
    if (created) created.listed += 1;
    if (isSoldStatus(i.status) && i.soldAt) {
      const p = index.get(isoDay(i.soldAt));
      if (p) {
        p.sold += 1;
        p.revenue += i.soldPrice ?? 0;
      }
    }
  }

  const statusCounts = new Map<ItemStatus, number>();
  for (const i of items) statusCounts.set(i.status, (statusCounts.get(i.status) ?? 0) + 1);
  const statusBreakdown = STATUS_ORDER.map((status) => ({ status, count: statusCounts.get(status) ?? 0 }));

  const revenue30d = sum(sold30, (i) => i.soldPrice);
  const revenuePrev = sum(soldPrev30, (i) => i.soldPrice);

  return {
    activeListings,
    sold30d: sold30.length,
    soldAll: sold.length,
    revenue30d,
    revenueAll: sum(sold, (i) => i.soldPrice),
    inventoryValueEstimate,
    realisedProfit: sum(sold, realisedProfit),
    realisedProfit30d: sum(sold30, realisedProfit),
    avgDaysToSale,
    medianDaysToSale,
    bestByRevenue,
    bestBySellThrough,
    marketplaces,
    drafts: items.filter((i) => i.status === "DRAFT").length,
    ready: items.filter((i) => i.status === "READY").length,
    shouldReprice,
    series,
    statusBreakdown,
    daysToSale,
    deltas: {
      sold30d: soldPrev30.length ? sold30.length - soldPrev30.length : null,
      revenue30d: revenuePrev ? revenue30d - revenuePrev : null,
    },
  };
}

/** Buckets days-to-sale values for a histogram. */
export const DAYS_BUCKETS = [
  { label: "0–3", min: 0, max: 3 },
  { label: "4–7", min: 4, max: 7 },
  { label: "8–14", min: 8, max: 14 },
  { label: "15–30", min: 15, max: 30 },
  { label: "31–60", min: 31, max: 60 },
  { label: "60+", min: 61, max: Infinity },
] as const;

export function histogramDays(values: number[]): Array<{ label: string; count: number }> {
  return DAYS_BUCKETS.map((b) => ({ label: b.label, count: values.filter((v) => v >= b.min && v <= b.max).length }));
}
