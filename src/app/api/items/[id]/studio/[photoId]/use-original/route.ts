import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { toPhotoDTO } from "@/lib/items/dto";
import { visiblePhotos } from "@/lib/photos/order";
import { provenanceMap, useOriginalForRender } from "@/lib/studio/renders";

type Params = { id: string; photoId: string };

const BodySchema = z.object({ discard: z.boolean().optional() }).default({});

/**
 * POST /api/items/[id]/studio/[photoId]/use-original — body { discard?: boolean }
 * Puts the original photo back in the render's gallery slot. The render moves to the end (kept,
 * still labelled) or is deleted when `discard` is true. → { photos, provenance, sourceId }
 */
export const POST = withUser<Params>(
  async (req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    const body = req.headers.get("content-length") && req.headers.get("content-length") !== "0" ? await parseBody(req, BodySchema) : {};
    const discard = body.discard ?? false;
    const { photos: all, source } = await useOriginalForRender(item.id, params.photoId, discard);
    const photos = visiblePhotos(all);
    await audit({ userId: user.id, action: discard ? "studio.use_original_discard" : "studio.use_original", entityType: "photo", entityId: params.photoId, meta: { itemId: item.id, sourceId: source.id }, ...requestMeta(req) });
    return json({ photos: photos.map((p) => toPhotoDTO(p)), provenance: provenanceMap(photos), sourceId: source.id });
  },
  { rateLimit: { key: "studio-mutate", limit: 40, windowSeconds: 600 } },
);
