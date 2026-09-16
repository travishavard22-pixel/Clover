import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { getOwnedItem } from "@/lib/items/access";
import { toPhotoDTO } from "@/lib/items/dto";
import { reorderPhotos } from "@/lib/photos/store";

const OrderSchema = z.object({ order: z.array(z.string().min(1)).min(1).max(64) });

/** PUT /api/items/[id]/photos/order — body { order: string[] } (a permutation of the visible photo ids) → { photos: PhotoDTO[] } */
export const PUT = withUser<{ id: string }>(async (req, { user, params }) => {
  const item = await getOwnedItem(user.id, params.id);
  const { order } = await parseBody(req, OrderSchema);
  const photos = await reorderPhotos(item.id, order);
  return json({ photos: photos.map((p) => toPhotoDTO(p)) });
});
