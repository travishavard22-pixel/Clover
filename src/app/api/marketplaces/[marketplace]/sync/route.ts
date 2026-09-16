import { ApiError, json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getAdapter, getConnection, parseMarketplace } from "@/lib/marketplaces";
import { MARKETPLACES } from "@/lib/marketplaces/registry";
import { enqueueJob } from "@/lib/jobs/queue";

/**
 * POST /api/marketplaces/[marketplace]/sync → { jobId }
 * Queues a SYNC_MARKETPLACE job that pulls offers and orders for this connection. 6 per 10 minutes.
 */
export const POST = withUser<{ marketplace: string }>(
  async (req, { user, params }) => {
    const marketplace = parseMarketplace(params.marketplace);
    if (!marketplace) throw new ApiError(404, "Unknown marketplace", "unknown_marketplace");
    const adapter = getAdapter(marketplace);
    const caps = adapter.capabilities();
    if (caps.offers !== "api" && caps.orders !== "api") throw new ApiError(409, `${MARKETPLACES[marketplace].name} has nothing to sync — offers and sales are recorded by hand in assisted mode.`, "not_syncable");
    const connection = await getConnection(user.id, marketplace);
    if (!connection || connection.status !== "CONNECTED") throw new ApiError(409, `Connect ${MARKETPLACES[marketplace].shortName} before syncing.`, "not_connected");
    const info = MARKETPLACES[marketplace];
    const label = connection.mode === "demo" ? `${info.name} (demo)` : info.name;
    const job = await enqueueJob(
      "SYNC_MARKETPLACE",
      { userId: user.id, marketplace },
      { userId: user.id, steps: [{ key: `offers:${marketplace}`, label: `Checking ${label} for new offers` }, { key: `orders:${marketplace}`, label: `Checking ${label} for new orders` }] },
    );
    await audit({ userId: user.id, action: "connection.sync.requested", entityType: "marketplace_connection", entityId: connection.id, meta: { marketplace, jobId: job.id }, ...requestMeta(req) });
    return json({ jobId: job.id });
  },
  { rateLimit: { key: "mp-sync", limit: 6, windowSeconds: 600 } },
);
