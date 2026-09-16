import { withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getAdapter, parseMarketplace } from "@/lib/marketplaces";
import { connectionsUrl, redirectWithReturn } from "@/lib/marketplaces/oauth-flow";
import { issueOAuthState } from "@/lib/marketplaces/oauth-state";
import { safeReturnTo } from "@/lib/marketplaces/return-to";
import { NextResponse } from "next/server";

/**
 * GET /api/marketplaces/[marketplace]/connect?returnTo=/items/…/publish
 * Issues a single-use OAuth state bound to this user and redirects to the marketplace's consent
 * screen (the in-app demo consent page when eBay credentials are not configured).
 */
export const GET = withUser<{ marketplace: string }>(
  async (req, { user, params }) => {
    const returnTo = safeReturnTo(new URL(req.url).searchParams.get("returnTo"));
    const marketplace = parseMarketplace(params.marketplace);
    if (!marketplace) return NextResponse.redirect(connectionsUrl(req, { error: "unknown_marketplace" }, returnTo));
    const adapter = getAdapter(marketplace);
    if (adapter.capabilities().connect !== "oauth" || !adapter.authorizeUrl) {
      return NextResponse.redirect(connectionsUrl(req, { error: "not_connectable", marketplace: marketplace.toLowerCase() }, returnTo));
    }
    const state = await issueOAuthState(user.id, marketplace);
    let target: string;
    try {
      target = adapter.authorizeUrl(state);
    } catch {
      return NextResponse.redirect(connectionsUrl(req, { error: "not_configured", marketplace: marketplace.toLowerCase() }, returnTo));
    }
    await audit({ userId: user.id, action: "connection.start", entityType: "marketplace_connection", entityId: marketplace, meta: { marketplace, returnTo }, ...requestMeta(req) });
    return redirectWithReturn(req, target, returnTo);
  },
  { rateLimit: { key: "mp-connect", limit: 20, windowSeconds: 600 } },
);
