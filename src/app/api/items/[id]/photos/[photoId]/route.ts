import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { toPhotoDTO } from "@/lib/items/dto";
import { deletePhoto, updatePhotoLabel } from "@/lib/photos/store";

type Params = { id: string; photoId: string };

const PatchSchema = z.object({ label: z.string().trim().max(80).nullable().optional() });

/** PATCH /api/items/[id]/photos/[photoId] — body { label?: string | null } → { photo: PhotoDTO } */
export const PATCH = withUser<Params>(async (req, { user, params }) => {
  const item = await getOwnedItem(user.id, params.id);
  const body = await parseBody(req, PatchSchema);
  const photo = await updatePhotoLabel(item.id, params.photoId, body.label ?? null);
  return json({ photo: toPhotoDTO(photo) });
});

/** DELETE /api/items/[id]/photos/[photoId] — removes the photo, its derived photos, its hidden edit sources and their storage objects → { photos: PhotoDTO[] } */
export const DELETE = withUser<Params>(async (req, { user, params }) => {
  const item = await getOwnedItem(user.id, params.id);
  const photos = await deletePhoto(item.id, params.photoId);
  await audit({ userId: user.id, action: "photo.delete", entityType: "photo", entityId: params.photoId, meta: { itemId: item.id }, ...requestMeta(req) });
  return json({ photos: photos.map((p) => toPhotoDTO(p)) });
});
