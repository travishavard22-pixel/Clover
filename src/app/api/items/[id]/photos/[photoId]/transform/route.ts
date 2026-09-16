import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { toPhotoDTO } from "@/lib/items/dto";
import { transformPhoto } from "@/lib/photos/store";
import { TransformRequestSchema } from "@/lib/photos/transform";

type Params = { id: string; photoId: string };

/**
 * POST /api/items/[id]/photos/[photoId]/transform
 * Body { rotate?: 0|90|180|270, crop?: {left,top,width,height} (in PhotoDTO pixel space), enhance?: boolean }
 *   → { photo: PhotoDTO } — a NEW photo (kind ENHANCED, sourcePhotoId) placed in the source's slot; the source is kept.
 * Body { useOriginal: true } → { photo: PhotoDTO } — the immutable original restored to this slot; the edit chain is discarded.
 */
export const POST = withUser<Params>(
  async (req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    const request = await parseBody(req, TransformRequestSchema);
    const photo = await transformPhoto({ userId: user.id, itemId: item.id, sourceId: params.photoId, request });
    await audit({
      userId: user.id,
      action: request.useOriginal ? "photo.restore" : "photo.transform",
      entityType: "photo",
      entityId: photo.id,
      meta: { itemId: item.id, sourcePhotoId: params.photoId, request },
      ...requestMeta(req),
    });
    return json({ photo: toPhotoDTO(photo) }, { status: request.useOriginal ? 200 : 201 });
  },
  { rateLimit: { key: "transform", limit: 120, windowSeconds: 600 } },
);
