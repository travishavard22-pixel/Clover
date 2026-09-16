import type { Marketplace, PublicationStatus } from "../../db";
import { MARKETPLACES } from "../../marketplaces/registry";
import { formatMoney } from "../../money";
import type { SnapshotItem, SnapshotOffer, SnapshotPublication } from "../types";

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

/** Publication statuses that mean "a buyer could still find this listing". Mirrors inventory/sold.ts. */
export const STILL_OPEN: ReadonlySet<PublicationStatus> = new Set(["READY", "NEEDS_ATTENTION", "PUBLISHING", "PUBLISHED", "REQUIRES_USER_ACTION"]);

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

export function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now.getTime() - t) / HOUR_MS);
}

export function isOpen(p: SnapshotPublication): boolean {
  return STILL_OPEN.has(p.status);
}

export function isLiveApi(p: SnapshotPublication): boolean {
  return p.mode === "API" && p.status === "PUBLISHED";
}

/** Offers received on or after the given instant (any status — a declined offer is still interest). */
export function offersSince(item: SnapshotItem, sinceIso: string | null): SnapshotOffer[] {
  if (!sinceIso) return item.offers;
  const since = Date.parse(sinceIso);
  return item.offers.filter((o) => Date.parse(o.receivedAt) >= since);
}

export function marketplaceName(m: Marketplace): string {
  return MARKETPLACES[m].name;
}

export function listNames(ms: Marketplace[]): string {
  const names = [...new Set(ms)].map(marketplaceName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function money(cents: number | null | undefined): string {
  return formatMoney(cents, "USD", { compact: true });
}

export function itemHref(itemId: string, hash?: string): string {
  return `/items/${itemId}${hash ? `#${hash}` : ""}`;
}

export function shortTitle(title: string, max = 48): string {
  const t = title.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Reads a string attribute off the free-form attributes JSON. */
export function attr(item: SnapshotItem, key: string): string | null {
  const v = item.attributes[key];
  return typeof v === "string" && v.trim() ? v : null;
}

export function attrBool(item: SnapshotItem, key: string): boolean | null {
  const v = item.attributes[key];
  return typeof v === "boolean" ? v : null;
}
