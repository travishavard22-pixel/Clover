import { z } from "zod";
import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { getOwnedItem } from "@/lib/items/access";
import { storage } from "@/lib/storage";
import { loadCachedMask } from "@/lib/studio/mask-cache";
import { STUDIO_MODES, STUDIO_MODE_IDS, type StudioModeId } from "@/lib/studio/modes";
import { mergeOptions, StudioOptionsInputSchema } from "@/lib/studio/options";
import { PREVIEW_MAX_EDGE, renderQuick, toJpegDataUrl } from "@/lib/studio/pipeline";
import { segmentationStatus } from "@/lib/studio/segmentation";

const BodySchema = z
  .object({
    photoId: z.string().min(1),
    /** One mode for the canvas preview… */
    mode: z.enum(STUDIO_MODE_IDS).optional(),
    /** …or several for the mode picker's thumbnails (each rendered with its own defaults unless `options` is given). */
    modes: z.array(z.enum(STUDIO_MODE_IDS)).min(1).max(STUDIO_MODE_IDS.length).optional(),
    options: StudioOptionsInputSchema.optional(),
    /** Long edge in px, 160–640. */
    size: z.number().int().min(160).max(PREVIEW_MAX_EDGE).optional(),
  })
  .refine((b) => b.mode || b.modes, { message: "Provide `mode` or `modes`" });

export type StudioPreview = { mode: StudioModeId; dataUrl: string; label: string; path: string; width: number; height: number; notes: string[] };

/**
 * POST /api/items/[id]/studio/preview — synchronous, small (≤ 640px) preview of what a render would
 * look like. Uses the cached cut-out when a previous render has produced one, otherwise the same
 * enhancement-only / crop path the job would take. Never calls a segmentation provider.
 *   body { photoId, mode | modes, options?, size? } → { previews: StudioPreview[], dataUrl: string }
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    const body = await parseBody(req, BodySchema);
    const photo = await db.photo.findFirst({ where: { id: body.photoId, itemId: item.id }, select: { id: true, storageKey: true, kind: true } });
    if (!photo) throw new ApiError(404, "Photo not found", "not_found");
    if (photo.kind === "STUDIO" || photo.kind === "CONDITION") throw new ApiError(400, "Previews are made from an original photo", "not_a_source");
    const source = await storage.get(photo.storageKey);
    if (!source) throw new ApiError(410, "The source file is no longer in storage", "missing_source");

    const modes = body.modes ?? [body.mode!];
    const size = body.size ?? PREVIEW_MAX_EDGE;
    const seg = segmentationStatus();
    const mask = modes.some((m) => STUDIO_MODES[m].needsSegmentation) ? await loadCachedMask(user.id, item.id, photo.id) : null;

    const previews: StudioPreview[] = [];
    for (const mode of modes) {
      const options = mergeOptions(STUDIO_MODES[mode].defaults, body.options);
      const r = await renderQuick({ source, mode, options, mask, maxEdge: size, unavailableReason: seg.reason });
      previews.push({ mode, dataUrl: await toJpegDataUrl(r.raw), label: r.label, path: r.path, width: r.raw.width, height: r.raw.height, notes: r.notes });
    }
    return json({ previews, dataUrl: previews[0]!.dataUrl }, { headers: { "Cache-Control": "no-store" } });
  },
  { rateLimit: { key: "studio-preview", limit: 600, windowSeconds: 600 } },
);
