import { db, type ConnectionStatus, type Marketplace, type MarketplaceConnection } from "../db";
import { capabilities } from "../env";
import { AssistedAdapter } from "./assisted/adapter";
import { DemoEbayAdapter } from "./ebay/demo-adapter";
import { EbayAdapter } from "./ebay/adapter";
import { NextdoorAdapter } from "./nextdoor/adapter";
import { MODE_LABELS, type ConnectionMode } from "./labels";
import { marketplaceMode, modeExplanation } from "./mode";
import { loadSellerPrefs } from "./prefs";
import { ALL_MARKETPLACES, MARKETPLACES, type MarketplaceInfo } from "./registry";
import { describeScope } from "./scopes";
import type { ConnectionCapabilities, MarketplaceAdapter } from "./types";

export { marketplaceMode, modeExplanation } from "./mode";
export type { ConnectionMode } from "./labels";

const cache = new Map<string, MarketplaceAdapter>();

/** The adapter that serves a marketplace right now: real API, Demo, or Assisted — decided by configured credentials. */
export function getAdapter(marketplace: Marketplace): MarketplaceAdapter {
  const mode = marketplaceMode(marketplace);
  const key = `${marketplace}:${mode}`;
  let a = cache.get(key);
  if (!a) {
    if (marketplace === "EBAY") a = mode === "api" ? new EbayAdapter() : new DemoEbayAdapter();
    else if (marketplace === "NEXTDOOR" && mode === "api") a = new NextdoorAdapter();
    else a = new AssistedAdapter(marketplace);
    cache.set(key, a);
  }
  return a;
}

export function isMarketplace(value: string): value is Marketplace {
  return (ALL_MARKETPLACES as string[]).includes(value);
}

/** Accepts `ebay`, `EBAY`, `Facebook`… from URLs and returns the enum value or null. */
export function parseMarketplace(value: string | undefined | null): Marketplace | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return isMarketplace(upper) ? upper : null;
}

export type ConnectionRow = {
  marketplace: Marketplace;
  name: string;
  shortName: string;
  color: string;
  tier: MarketplaceInfo["tier"];
  createUrl: string | null;
  mode: ConnectionMode;
  modeLabel: string;
  modeExplanation: string;
  /** Assisted marketplaces need no account link; the UI shows this instead of a Connect button. */
  connectable: boolean;
  status: ConnectionStatus;
  accountName: string | null;
  scopes: Array<{ scope: string; label: string }>;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
  isDefault: boolean;
  capabilities: ConnectionCapabilities;
  /** Extra plain-language note (e.g. Nextdoor Publish API access pending). */
  note: string | null;
  livePublications: number;
};

export function connectionRow(marketplace: Marketplace, connection: MarketplaceConnection | null, opts: { isDefault: boolean; livePublications: number }): ConnectionRow {
  const info = MARKETPLACES[marketplace];
  const mode = marketplaceMode(marketplace);
  const adapter = getAdapter(marketplace);
  const caps = adapter.capabilities();
  const connectable = caps.connect === "oauth";
  return {
    marketplace,
    name: info.name,
    shortName: info.shortName,
    color: info.color,
    tier: info.tier,
    createUrl: info.createUrl,
    mode,
    modeLabel: MODE_LABELS[mode],
    modeExplanation: modeExplanation(marketplace, mode),
    connectable,
    status: connectable ? (connection?.status ?? "NOT_CONNECTED") : "NOT_CONNECTED",
    accountName: connection?.externalAccountName ?? null,
    scopes: (connection?.scopes.length ? connection.scopes : connectable ? defaultScopes(marketplace) : []).map(describeScope),
    lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
    lastError: connection?.lastError ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    isDefault: opts.isDefault,
    capabilities: caps,
    note: marketplace === "NEXTDOOR" && mode === "assisted" ? "Publish API access pending — assisted mode active." : null,
    livePublications: opts.livePublications,
  };
}

function defaultScopes(marketplace: Marketplace): string[] {
  if (marketplace === "EBAY") return ["https://api.ebay.com/oauth/api_scope", "https://api.ebay.com/oauth/api_scope/sell.inventory", "https://api.ebay.com/oauth/api_scope/sell.account", "https://api.ebay.com/oauth/api_scope/sell.fulfillment", "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"];
  if (marketplace === "NEXTDOOR") return ["openid", "post:write", "post:read"];
  return [];
}

/** One row per marketplace (user defaults first), whether or not a connection record exists. */
export async function getConnections(userId: string): Promise<ConnectionRow[]> {
  const [connections, prefs, live] = await Promise.all([
    db.marketplaceConnection.findMany({ where: { userId } }),
    loadSellerPrefs(userId),
    db.publication.groupBy({ by: ["marketplace"], where: { userId, status: { in: ["PUBLISHED", "REQUIRES_USER_ACTION", "PUBLISHING", "NEEDS_ATTENTION"] } }, _count: { _all: true } }),
  ]);
  const byMp = new Map(connections.map((c) => [c.marketplace, c]));
  const liveBy = new Map(live.map((l) => [l.marketplace, l._count._all]));
  const defaults = prefs.defaultMarketplaces.filter(isMarketplace);
  const ordered = [...defaults, ...ALL_MARKETPLACES.filter((m) => !defaults.includes(m))];
  return ordered.map((m) => connectionRow(m, byMp.get(m) ?? null, { isDefault: defaults.includes(m), livePublications: liveBy.get(m) ?? 0 }));
}

export async function getConnection(userId: string, marketplace: Marketplace): Promise<MarketplaceConnection | null> {
  return db.marketplaceConnection.findUnique({ where: { userId_marketplace: { userId, marketplace } } });
}

/** True when the marketplace is served by a real or demo API adapter (as opposed to assisted). */
export function isApiMode(marketplace: Marketplace): boolean {
  return marketplaceMode(marketplace) !== "assisted";
}

export const runtimeCapabilities = capabilities;
