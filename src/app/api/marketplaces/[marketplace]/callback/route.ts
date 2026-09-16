import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { connectionRow, getAdapter, parseMarketplace } from "@/lib/marketplaces";
import { clearReturnCookie, connectionsUrl, readReturnCookie } from "@/lib/marketplaces/oauth-flow";
import { consumeOAuthState } from "@/lib/marketplaces/oauth-state";

/**
 * GET /api/marketplaces/[marketplace]/callback?code=…&state=…
 * Verifies and consumes the state, exchanges the code through the adapter, records the connection
 * and returns the seller to `/connections?connected=<m>` or the page they started from.
 */
export const GET = withUser<{ marketplace: string }>(
  async (req, { user, params }) => {
    const url = new URL(req.url);
    const returnTo = readReturnCookie(req);
    const marketplace = parseMarketplace(params.marketplace);
    const back = (p: Record<string, string | null | undefined>) => clearReturnCookie(NextResponse.redirect(connectionsUrl(req, { ...p, marketplace: marketplace?.toLowerCase() }, returnTo)));
    if (!marketplace) return back({ error: "unknown_marketplace" });
    const adapter = getAdapter(marketplace);
    if (adapter.capabilities().connect !== "oauth" || !adapter.handleCallback) return back({ error: "not_connectable" });

    const state = url.searchParams.get("state") ?? "";
    const okState = await consumeOAuthState(user.id, marketplace, state);
    if (!okState) {
      await audit({ userId: user.id, action: "connection.state_rejected", entityType: "marketplace_connection", entityId: marketplace, meta: { marketplace }, ...requestMeta(req) });
      return back({ error: "state_invalid" });
    }
    const providerError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (providerError || !code) {
      await audit({ userId: user.id, action: "connection.denied", entityType: "marketplace_connection", entityId: marketplace, meta: { marketplace, providerError }, ...requestMeta(req) });
      return back({ error: "denied" });
    }
    try {
      const connection = await adapter.handleCallback(user.id, code);
      const row = connectionRow(marketplace, connection, { isDefault: false, livePublications: 0 });
      await audit({ userId: user.id, action: "connection.connected", entityType: "marketplace_connection", entityId: connection.id, meta: { marketplace, mode: row.mode, account: connection.externalAccountName, scopes: connection.scopes }, ...requestMeta(req) });
      return back({ connected: marketplace.toLowerCase() });
    } catch (err) {
      console.error("[marketplaces/callback]", err);
      await audit({ userId: user.id, action: "connection.failed", entityType: "marketplace_connection", entityId: marketplace, meta: { marketplace, error: err instanceof Error ? err.message : String(err) }, ...requestMeta(req) });
      return back({ error: "exchange_failed" });
    }
  },
  { rateLimit: { key: "mp-callback", limit: 20, windowSeconds: 600 } },
);
