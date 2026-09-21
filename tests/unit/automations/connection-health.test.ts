import { describe, expect, it } from "vitest";
import { connectionIssues, evaluateConnectionHealth } from "@/lib/automations/evaluators/connection-health";
import { AUTOMATIONS } from "@/lib/automations/registry";
import type { ConnectionHealthConfig } from "@/lib/automations/types";
import { connection, evaluationContext } from "../../support/snapshot";

const RULE = AUTOMATIONS.CONNECTION_HEALTH.defaultConfig as ConnectionHealthConfig;
const NOW = new Date("2026-09-21T00:00:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const codes = (cs: Parameters<typeof connectionIssues>[0], config = RULE) => connectionIssues(cs, NOW, config).map((i) => i.code);

describe("connectionIssues", () => {
  it("says nothing about a healthy connection", () => {
    expect(codes([connection({ refreshTokenExpiresAt: inDays(200) })])).toEqual([]);
    expect(codes([connection()])).toEqual([]);
  });

  it("reports an authorization that expired or was revoked", () => {
    const [issue] = connectionIssues([connection({ status: "NEEDS_REAUTH" })], NOW, RULE);
    expect(issue!.code).toBe("reauth");
    // The consequence is the point: a seller who does not know what stopped will not go and fix it.
    expect(issue!.message).toContain("nothing publishes, syncs or answers offers");
  });

  it("reports a connection in error, quoting what the marketplace said", () => {
    const [issue] = connectionIssues([connection({ status: "ERROR", lastError: "Insufficient permissions for scope sell.inventory" })], NOW, RULE);
    expect(issue!.code).toBe("error");
    expect(issue!.message).toContain("sell.inventory");
  });

  it("warns before an expiry rather than after it", () => {
    expect(codes([connection({ refreshTokenExpiresAt: inDays(13) })])).toEqual(["expiring"]);
    expect(codes([connection({ refreshTokenExpiresAt: inDays(15) })])).toEqual([]);
    // The seller's own window, not ours.
    expect(codes([connection({ refreshTokenExpiresAt: inDays(15) })], { warnBeforeExpiryDays: 30 })).toEqual(["expiring"]);
  });

  it("phrases an already-expired authorization in the past tense", () => {
    const [issue] = connectionIssues([connection({ refreshTokenExpiresAt: inDays(-2) })], NOW, RULE);
    expect(issue!.message).toContain("has expired");
  });

  it("ignores connections with no real authorization behind them", () => {
    // Demo eBay and assisted marketplaces have no token to expire; warning about one would be a lie.
    expect(codes([connection({ mode: "demo", status: "NEEDS_REAUTH" })])).toEqual([]);
    expect(codes([connection({ marketplace: "FACEBOOK", mode: "assisted", status: "ERROR" })])).toEqual([]);
  });
});

describe("evaluateConnectionHealth", () => {
  it("points at the connections page and notifies whatever the seller's item preferences say", () => {
    const ctx = evaluationContext([], { connections: [connection({ status: "NEEDS_REAUTH" })], now: NOW });
    const [p] = evaluateConnectionHealth(ctx, RULE);
    expect(p!.itemId).toBeNull();
    expect(p!.title).toBe("Reconnect eBay");
    expect(p!.proposal).toMatchObject({ action: "notify", href: "/connections" });
    // Not gated on an item-level notification preference: this one is about the account.
    expect(p!.notifyPreference).toBeNull();
  });

  it("raises a connection left broken at most once a week", () => {
    // De-duplication drops a proposal whose key was ever used, so the key is what decides how
    // often a standing problem is repeated: same within a week, new after one.
    const broken = [connection({ status: "NEEDS_REAUTH" })];
    const key = (at: Date) => evaluateConnectionHealth(evaluationContext([], { connections: broken, now: at }), RULE)[0]!.proposal.key;
    expect(key(NOW)).toBe(key(new Date(NOW.getTime() + 3_600_000)));
    expect(key(NOW)).not.toBe(key(new Date(NOW.getTime() + 8 * 86_400_000)));
  });
});
