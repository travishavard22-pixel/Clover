import { z } from "zod";
import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { db } from "@/lib/db";
import { getOwnedItem } from "@/lib/items/access";
import { enqueueStudioRender } from "@/lib/studio/job";
import { STUDIO_MODE_IDS } from "@/lib/studio/modes";
import { StudioOptionsInputSchema } from "@/lib/studio/options";

const BodySchema = z.object({
  photoId: z.string().min(1),
  mode: z.enum(STUDIO_MODE_IDS),
  options: StudioOptionsInputSchema.optional(),
  initiatedBy: z.literal("user").optional(),
});

/**
 * POST /api/items/[id]/studio/render — body { photoId, mode, options?, initiatedBy?: "user" }
 *   → 202 { jobId, reused: false } (or 200 { jobId, reused: true } when the same render is already queued or running).
 * The job's steps stream over GET /api/jobs/[jobId]/events.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    const body = await parseBody(req, BodySchema);
    const photo = await db.photo.findFirst({ where: { id: body.photoId, itemId: item.id }, select: { id: true, kind: true } });
    if (!photo) throw new ApiError(404, "Photo not found", "not_found");
    if (photo.kind === "STUDIO" || photo.kind === "CONDITION") throw new ApiError(400, "Pick an original photo — studio photos are always made from the real one", "not_a_source");

    const active = await db.job.findFirst({
      where: { itemId: item.id, type: "STUDIO_RENDER", status: { in: ["QUEUED", "RUNNING"] }, payload: { path: ["photoId"], equals: body.photoId } },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true },
    });
    if (active && (active.payload as { mode?: string }).mode === body.mode && JSON.stringify((active.payload as { options?: unknown }).options ?? null) === JSON.stringify(body.options ?? null)) {
      return json({ jobId: active.id, reused: true });
    }

    const job = await enqueueStudioRender(user.id, { itemId: item.id, photoId: photo.id, mode: body.mode, options: body.options, initiatedBy: body.initiatedBy });
    await audit({ userId: user.id, action: "studio.render", entityType: "item", entityId: item.id, meta: { jobId: job.id, photoId: photo.id, mode: body.mode }, ...requestMeta(req) });
    return json({ jobId: job.id, reused: false }, { status: 202 });
  },
  { rateLimit: { key: "studio-render", limit: 40, windowSeconds: 600 } },
);
