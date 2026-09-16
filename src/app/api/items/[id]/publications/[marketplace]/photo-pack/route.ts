import { ApiError, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseMarketplace } from "@/lib/marketplaces";
import { buildPhotoPack, photoPackName } from "@/lib/marketplaces/assisted/photo-pack";
import { visiblePhotos } from "@/lib/photos/order";

export const dynamic = "force-dynamic";

/**
 * GET /api/items/[id]/publications/[marketplace]/photo-pack → application/zip
 * The photos the seller uploads by hand on an assisted marketplace: the listing order, capped at
 * the marketplace's photo limit, long edge ≤ 2000 px, named 01-cover.jpg, 02.jpg, …
 */
export const GET = withUser<{ id: string; marketplace: string }>(
  async (req, { user, params }) => {
    const marketplace = parseMarketplace(params.marketplace);
    if (!marketplace) throw new ApiError(404, "Unknown marketplace", "unknown_marketplace");
    const item = await db.item.findFirst({ where: { id: params.id, userId: user.id }, include: { photos: true } });
    if (!item) throw new ApiError(404, "Item not found", "not_found");
    const photos = visiblePhotos(item.photos);
    if (photos.length === 0) throw new ApiError(400, "This item has no photos yet.", "no_photos");
    const pack = await buildPhotoPack(photos, marketplace);
    if (pack.count === 0) throw new ApiError(500, "The photo files could not be read. Try again in a moment.", "photos_unreadable");
    await audit({ userId: user.id, action: "publication.photo_pack", entityType: "item", entityId: item.id, meta: { marketplace, count: pack.count, skipped: pack.skipped }, ...requestMeta(req) });
    const filename = photoPackName(item.sku, marketplace);
    return new Response(new Uint8Array(pack.zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(pack.zip.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Photo-Count": String(pack.count),
        "X-Photo-Skipped": String(pack.skipped),
      },
    });
  },
  { rateLimit: { key: "photo-pack", limit: 30, windowSeconds: 600 } },
);
