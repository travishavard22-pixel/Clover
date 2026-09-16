import { ApiError, json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { ANALYZE_STEPS } from "@/lib/analysis/steps";
import { db } from "@/lib/db";
import { getOwnedItem } from "@/lib/items/access";
import { canTransition } from "@/lib/items/status";
import { enqueueJob } from "@/lib/jobs/queue";
import { listPhotos } from "@/lib/photos/store";
import { visiblePhotos } from "@/lib/photos/order";

/**
 * POST /api/items/[id]/analyze → { jobId, reused: boolean }
 * Enqueues ANALYZE_ITEM with the declared step plan and moves the item to ANALYZING. If a job for
 * this item is already queued or running it is returned instead of starting a duplicate.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    const active = await db.job.findFirst({ where: { itemId: item.id, type: "ANALYZE_ITEM", status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (active) return json({ jobId: active.id, reused: true });

    const photos = visiblePhotos(await listPhotos(item.id));
    if (photos.length === 0) throw new ApiError(400, "Add at least one photo before analyzing", "no_photos");
    if (!canTransition(item.status, "ANALYZING")) throw new ApiError(409, `An item that is ${item.status.toLowerCase().replace("_", " ")} cannot be re-analyzed`, "bad_status");

    const job = await enqueueJob("ANALYZE_ITEM", { itemId: item.id }, { userId: user.id, itemId: item.id, steps: [...ANALYZE_STEPS] });
    await db.item.update({ where: { id: item.id }, data: { status: "ANALYZING" } });
    await audit({ userId: user.id, action: "item.analyze", entityType: "item", entityId: item.id, meta: { jobId: job.id, photos: photos.length }, ...requestMeta(req) });
    return json({ jobId: job.id, reused: false }, { status: 202 });
  },
  { rateLimit: { key: "analyze", limit: 30, windowSeconds: 600 } },
);
