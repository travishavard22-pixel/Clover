import { finalizeSegmentation } from "./mask";
import { imageFormData, segmentFetch } from "./http";
import type { SegmentationProvider, SegmentationResult } from "./types";

/**
 * Photoroom Remove Background API.
 * POST https://sdk.photoroom.com/v1/segment — multipart `image_file`, header `x-api-key`.
 * Response body: PNG with alpha (the cut-out). ~$0.02/image on the paid plan.
 */
export const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";

export class PhotoroomSegmentation implements SegmentationProvider {
  readonly name = "photoroom";
  constructor(private readonly apiKey: string) {}

  async segment(image: Buffer): Promise<SegmentationResult> {
    const fd = imageFormData("image_file", image);
    fd.append("format", "png");
    const res = await segmentFetch(PHOTOROOM_SEGMENT_URL, { method: "POST", headers: { "x-api-key": this.apiKey, Accept: "image/png, application/json" }, body: fd }, "Photoroom");
    const cutout = Buffer.from(await res.arrayBuffer());
    return finalizeSegmentation(image, { cutout }, this.name, "photoroom/segment-v1");
  }
}
