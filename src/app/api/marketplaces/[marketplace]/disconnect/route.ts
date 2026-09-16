import { ApiError, json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { connectionRow, getAdapter, getConnection, parseMarketplace } from "@/lib/marketplaces";

/**
 * POST /api/marketplaces/[marketplace]/disconnect → { connection: ConnectionRow }
 * Deletes the stored tokens and account link. Live publications stay recorded but can no longer
 * be updated through the API until the marketplace is reconnected.
 */
export const POST = withUser<{ marketplace: string }>(
  async (req, { user, params }) => {
    const marketplace = parseMarketplace(params.marketplace);
    if (!marketplace) throw new ApiError(404, "Unknown marketplace", "unknown_marketplace");
    const adapter = getAdapter(marketplace);
    if (adapter.capabilities().connect !== "oauth") throw new ApiError(409, "This marketplace has no account link to remove.", "not_connectable");
    const before = await getConnection(user.id, marketplace);
    await adapter.disconnect(user.id);
    await audit({ userId: user.id, action: "connection.disconnected", entityType: "marketplace_connection", entityId: before?.id ?? marketplace, meta: { marketplace, account: before?.externalAccountName ?? null }, ...requestMeta(req) });
    return json({ connection: connectionRow(marketplace, null, { isDefault: false, livePublications: 0 }) });
  },
  { rateLimit: { key: "mp-disconnect", limit: 20, windowSeconds: 600 } },
);
