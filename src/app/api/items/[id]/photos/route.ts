import { ApiError, json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { toPhotoDTO } from "@/lib/items/dto";
import { MAX_UPLOAD_BYTES } from "@/lib/photos/mime";
import { listPhotos, storeUploadedPhoto } from "@/lib/photos/store";

type Params = { id: string };

/** GET /api/items/[id]/photos → { photos: PhotoDTO[] } (every photo, including superseded edit sources; use visiblePhotos() to filter). */
export const GET = withUser<Params>(async (_req, { user, params }) => {
  const item = await getOwnedItem(user.id, params.id);
  const photos = await listPhotos(item.id);
  return json({ photos: photos.map((p) => toPhotoDTO(p)) });
});

/**
 * POST /api/items/[id]/photos — multipart with field `file` (+ optional `label`).
 * Validates from magic bytes, re-encodes through sharp (metadata stripped), stores orig/web/thumb.
 * → { photo: PhotoDTO }
 */
export const POST = withUser<Params>(
  async (req, { user, params }) => {
    const item = await getOwnedItem(user.id, params.id);
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) throw new ApiError(413, "Photos must be 25 MB or smaller", "too_large");

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected multipart form data with a `file` field", "bad_multipart");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Missing `file` field", "missing_file");
    const labelRaw = form.get("label");
    const label = typeof labelRaw === "string" ? labelRaw : null;

    const bytes = Buffer.from(await file.arrayBuffer());
    const photo = await storeUploadedPhoto({ userId: user.id, itemId: item.id, bytes, label });
    await audit({ userId: user.id, action: "photo.upload", entityType: "photo", entityId: photo.id, meta: { itemId: item.id, bytes: bytes.length }, ...requestMeta(req) });
    return json({ photo: toPhotoDTO(photo) }, { status: 201 });
  },
  { rateLimit: { key: "upload", limit: 120, windowSeconds: 600 } },
);
