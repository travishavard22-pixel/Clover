import { SegmentationFailed } from "./types";

export const SEGMENT_TIMEOUT_MS = 60_000;

/** Small fetch wrapper: timeout, non-2xx → SegmentationFailed with a short, non-secret message. */
export async function segmentFetch(url: string, init: RequestInit, providerName: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(SEGMENT_TIMEOUT_MS) });
  } catch (err) {
    throw new SegmentationFailed(`${providerName} did not respond (network error or timeout)`, err);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SegmentationFailed(`${providerName} returned HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  return res;
}

export function imageFormData(field: string, image: Buffer, filename = "photo.jpg"): FormData {
  const fd = new FormData();
  fd.append(field, new Blob([new Uint8Array(image)], { type: "image/jpeg" }), filename);
  return fd;
}
