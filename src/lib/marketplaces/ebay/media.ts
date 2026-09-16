import type { MarketplaceConnection } from "../../db";
import { ebayUserFetch, ebayUserRequest } from "./client";
import { EbayApiError } from "./errors";

const BASE = "/commerce/media/v1_beta";

function imageIdFromLocation(res: Response): string {
  const loc = res.headers.get("location") ?? "";
  const id = loc.split("/").filter(Boolean).pop();
  if (!id) throw new EbayApiError("eBay Media API did not return an image id", 502, [], true);
  return id;
}

/** GET /image/{id} → the eBay-hosted (EPS) URL we pass to the Inventory API. */
export async function getImage(c: MarketplaceConnection, imageId: string): Promise<{ imageId: string; imageUrl: string; expirationDate?: string }> {
  const data = await ebayUserFetch<{ imageId?: string; imageUrl: string; expirationDate?: string }>(c, { host: "apim", path: `${BASE}/image/${imageId}` });
  return { imageId, imageUrl: data.imageUrl, expirationDate: data.expirationDate };
}

/** POST /image/create_image_from_url — eBay fetches our signed HTTPS URL. */
export async function createImageFromUrl(c: MarketplaceConnection, imageUrl: string): Promise<{ imageId: string; imageUrl: string }> {
  const res = await ebayUserRequest(c, { method: "POST", host: "apim", path: `${BASE}/image/create_image_from_url`, body: { imageUrl } });
  const imageId = imageIdFromLocation(res);
  return getImage(c, imageId);
}

/** POST /image/create_image_from_file — multipart fallback when eBay cannot reach our URL (e.g. localhost). */
export async function createImageFromFile(c: MarketplaceConnection, data: Buffer, filename = "photo.jpg", mimeType = "image/jpeg"): Promise<{ imageId: string; imageUrl: string }> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(data)], { type: mimeType }), filename);
  const res = await ebayUserRequest(c, { method: "POST", host: "apim", path: `${BASE}/image/create_image_from_file`, form });
  const imageId = imageIdFromLocation(res);
  return getImage(c, imageId);
}

/** Upload with URL first, falling back to the multipart route when the URL is not publicly reachable. */
export async function uploadListingImage(c: MarketplaceConnection, opts: { url: string; bytes: () => Promise<Buffer>; filename: string }): Promise<{ imageId: string; imageUrl: string }> {
  const isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(opts.url) || opts.url.startsWith("http://");
  if (!isLocal) {
    try {
      return await createImageFromUrl(c, opts.url);
    } catch (e) {
      if (!(e instanceof EbayApiError) || e.status >= 500) throw e;
    }
  }
  return createImageFromFile(c, await opts.bytes(), opts.filename);
}
