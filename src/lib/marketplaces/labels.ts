import type { PublicationStatus, Marketplace } from "../db";

/**
 * Client-safe labels for the marketplace UI. This module must not import env or db so it can be
 * bundled into client components.
 */
export type ConnectionMode = "api" | "assisted" | "demo";

export const MODE_LABELS: Record<ConnectionMode, string> = { api: "API", assisted: "Assisted", demo: "Demo" };

export const MODE_SHORT_HELP: Record<ConnectionMode, string> = {
  api: "Published through the marketplace's official API.",
  assisted: "You post it yourself; Clover prepares everything and records the result.",
  demo: "Simulated locally. Nothing is sent to the marketplace.",
};

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "inverse";

export const PUBLICATION_STATUS_META: Record<PublicationStatus, { label: string; tone: Tone; description: string }> = {
  READY: { label: "Ready", tone: "neutral", description: "Prepared, not published yet" },
  NEEDS_ATTENTION: { label: "Needs attention", tone: "warning", description: "The marketplace needs a fix before this can go live" },
  PUBLISHING: { label: "Publishing", tone: "info", description: "Clover is publishing this listing" },
  PUBLISHED: { label: "Live", tone: "success", description: "Live on the marketplace" },
  FAILED: { label: "Failed", tone: "danger", description: "Publishing failed; nothing was posted" },
  REQUIRES_USER_ACTION: { label: "Your turn", tone: "warning", description: "Finish this step on the marketplace" },
  ENDED: { label: "Ended", tone: "neutral", description: "No longer live" },
  SOLD: { label: "Sold", tone: "inverse", description: "Sold on this marketplace" },
};

/** Statuses that count as "live or about to be" for the double-sell guard and the listings board. */
export const LIVE_PUBLICATION_STATUSES: PublicationStatus[] = ["READY", "NEEDS_ATTENTION", "PUBLISHING", "PUBLISHED", "REQUIRES_USER_ACTION"];

/** One or two letters for the monogram tile (we never show third-party logos). */
export function monogram(shortName: string): string {
  const words = shortName.trim().split(/\s+/);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const w = words[0] ?? "";
  // eBay → "eB", OfferUp → "Of", Mercari → "Me"
  return w.slice(0, 2);
}

export const MARKETPLACE_ORDER: Marketplace[] = ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"];

/** Masks a buyer handle for notifications: "jordan_k" → "j******k". */
export function maskBuyer(name: string): string {
  const n = name.trim();
  if (n.length <= 2) return "***";
  return `${n[0]}${"*".repeat(Math.min(3, Math.max(1, n.length - 2)))}${n[n.length - 1]}`;
}

export function daysSince(iso: string | Date | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}
