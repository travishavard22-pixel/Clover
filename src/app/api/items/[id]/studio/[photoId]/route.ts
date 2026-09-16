import { json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { deleteRender, provenanceMap } from "@/lib/studio/renders";
import { toPhotoDTO } from "@/lib/items/dto";
import { visiblePhotos } from "@/lib/photos/order";

type Params = { id: string; photoId: string };

/** DELETE /api/items/[id]/studio/[photoId] — removes a studio render and its files (the source photo is untouched) → { photos, provenance } */
export const DELETE = withUser<Params>(
  async (req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    const photos = visiblePhotos(await deleteRender(item.id, params.photoId));
    await audit({ userId: user.id, action: "studio.delete", entityType: "photo", entityId: params.photoId, meta: { itemId: item.id }, ...requestMeta(req) });
    return json({ photos: photos.map((p) => toPhotoDTO(p)), provenance: provenanceMap(photos) });
  },
  { rateLimit: { key: "studio-mutate", limit: 40, windowSeconds: 600 } },
);
