import { finalizeSegmentation } from "./mask";
import { segmentFetch } from "./http";
import { SegmentationFailed, type SegmentationProvider, type SegmentationResult } from "./types";

/**
 * Self-hosted matting on Runpod Serverless (e.g. BiRefNet via `rembg`).
 *
 * Expected worker contract:
 *   POST https://api.runpod.ai/v2/{endpointId}/runsync   Authorization: Bearer <RUNPOD_API_KEY>
 *   request : { "input": { "image_base64": "<JPEG/PNG bytes, base64>" } }
 *   response: { "id": "...", "status": "COMPLETED",
 *               "output": { "mask_base64": "<PNG, single channel or RGB(A) where white = item>", "model": "birefnet-general" } }
 *   Any other `status` (FAILED, TIMED_OUT, IN_QUEUE after runsync's wait) is treated as a failure.
 *
 * A minimal handler (handler.py) that satisfies this:
 *   from rembg import new_session, remove; import base64, io, runpod
 *   session = new_session("birefnet-general")
 *   def handler(job):
 *       img = base64.b64decode(job["input"]["image_base64"])
 *       mask = remove(img, session=session, only_mask=True)
 *       return {"mask_base64": base64.b64encode(mask).decode(), "model": "birefnet-general"}
 *   runpod.serverless.start({"handler": handler})
 */
export function runpodRunSyncUrl(endpointId: string) {
  return `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/runsync`;
}

type RunpodResponse = { status?: string; error?: string; output?: { mask_base64?: string; model?: string } };

export class RunpodSegmentation implements SegmentationProvider {
  readonly name = "runpod";
  constructor(
    private readonly apiKey: string,
    private readonly endpointId: string,
  ) {}

  async segment(image: Buffer): Promise<SegmentationResult> {
    const res = await segmentFetch(
      runpodRunSyncUrl(this.endpointId),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: { image_base64: image.toString("base64") } }),
      },
      "Runpod",
    );
    const body = (await res.json().catch(() => null)) as RunpodResponse | null;
    if (!body || body.status !== "COMPLETED" || !body.output?.mask_base64) {
      throw new SegmentationFailed(`Runpod worker did not return a mask (status ${body?.status ?? "unknown"}${body?.error ? `: ${body.error.slice(0, 120)}` : ""})`);
    }
    const mask = Buffer.from(body.output.mask_base64, "base64");
    return finalizeSegmentation(image, { mask }, this.name, body.output.model ?? "runpod/custom");
  }
}
