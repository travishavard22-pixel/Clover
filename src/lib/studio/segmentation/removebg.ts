import { finalizeSegmentation } from "./mask";
import { imageFormData, segmentFetch } from "./http";
import type { SegmentationProvider, SegmentationResult } from "./types";

/**
 * remove.bg API.
 * POST https://api.remove.bg/v1.0/removebg — multipart `image_file`, `size: auto`, header `X-Api-Key`.
 * Response body: PNG with alpha. Roughly 10× Photoroom's price; use when edge quality demands it.
 */
export const REMOVEBG_URL = "https://api.remove.bg/v1.0/removebg";

export class RemoveBgSegmentation implements SegmentationProvider {
  readonly name = "removebg";
  constructor(private readonly apiKey: string) {}

  async segment(image: Buffer): Promise<SegmentationResult> {
    const fd = imageFormData("image_file", image);
    fd.append("size", "auto");
    fd.append("format", "png");
    const res = await segmentFetch(REMOVEBG_URL, { method: "POST", headers: { "X-Api-Key": this.apiKey, Accept: "image/png" }, body: fd }, "remove.bg");
    const cutout = Buffer.from(await res.arrayBuffer());
    return finalizeSegmentation(image, { cutout }, this.name, "remove.bg/v1.0");
  }
}
