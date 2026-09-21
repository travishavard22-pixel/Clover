import type { Marketplace } from "../../db";
import { MARKETPLACES } from "../../marketplaces/registry";
import type { ConnectionHealthConfig, EvaluationContext, Evaluator, Proposal, SnapshotConnection } from "../types";
import { DAY_MS, marketplaceName, plural } from "./shared";

/**
 * Watches the connections every other automation depends on.
 *
 * A marketplace authorization that has expired or been revoked is the quietest failure Clover has:
 * nothing errors where the seller can see it, offers simply stop arriving, listings stop syncing,
 * and the app looks perfectly healthy. The seller finds out when something they thought was listed
 * turns out never to have been. So a broken connection is reported, and an expiry is reported
 * *before* it happens rather than after.
 *
 * This one can never run unattended: reconnecting means signing in to the marketplace, which only
 * the seller can do. Clover says so rather than offering an AUTO mode it cannot honour.
 */

export type ConnectionIssue =
  | { code: "reauth"; marketplace: Marketplace; message: string }
  | { code: "error"; marketplace: Marketplace; message: string }
  | { code: "expiring"; marketplace: Marketplace; message: string; days: number };

/** Pure: the issues in one seller's connections. Exported for tests. */
export function connectionIssues(connections: SnapshotConnection[], now: Date, config: ConnectionHealthConfig): ConnectionIssue[] {
  const out: ConnectionIssue[] = [];
  for (const c of connections) {
    // Demo connections have no real authorization to expire, and assisted ones have none at all.
    if (c.mode !== "api") continue;
    const name = marketplaceName(c.marketplace);
    if (c.status === "NEEDS_REAUTH") {
      out.push({ code: "reauth", marketplace: c.marketplace, message: `${name} needs you to sign in again. Until you do, nothing publishes, syncs or answers offers there.` });
      continue;
    }
    if (c.status === "ERROR") {
      out.push({ code: "error", marketplace: c.marketplace, message: `${name} is returning an error${c.lastError ? `: ${c.lastError.slice(0, 160)}` : "."} Listings and offers there are not syncing.` });
      continue;
    }
    if (c.status !== "CONNECTED" || !c.refreshTokenExpiresAt) continue;
    const at = Date.parse(c.refreshTokenExpiresAt);
    if (Number.isNaN(at)) continue;
    const days = Math.floor((at - now.getTime()) / DAY_MS);
    if (days > config.warnBeforeExpiryDays) continue;
    out.push({
      code: "expiring",
      marketplace: c.marketplace,
      days,
      message: days <= 0 ? `Your ${name} authorization has expired. Sign in again to start it back up.` : `Your ${name} authorization expires in ${plural(days, "day")}. Sign in again before it does and nothing stops.`,
    });
  }
  return out;
}

const TITLES: Record<ConnectionIssue["code"], (name: string) => string> = {
  reauth: (n) => `Reconnect ${n}`,
  error: (n) => `${n} connection error`,
  expiring: (n) => `${n} sign-in expires soon`,
};

export const evaluateConnectionHealth: Evaluator<"CONNECTION_HEALTH"> = (ctx: EvaluationContext, config: ConnectionHealthConfig): Proposal[] => {
  return connectionIssues(ctx.connections, ctx.now, config).map((issue) => {
    // Keyed by the week number so a connection left broken is raised at most once a week — often
    // enough that it is not reported once and then forgotten, rarely enough not to be a nag.
    const week = Math.floor(ctx.now.getTime() / (7 * DAY_MS));
    return {
      type: "CONNECTION_HEALTH" as const,
      itemId: null,
      title: TITLES[issue.code](MARKETPLACES[issue.marketplace].shortName),
      body: issue.message,
      proposal: { key: `connection:${issue.marketplace}:${issue.code}:${week}`, action: "notify" as const, itemId: null, href: "/connections" },
      autoExecutable: true,
      notifyPreference: null,
    };
  });
};
