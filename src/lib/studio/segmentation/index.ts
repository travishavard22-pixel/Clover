import { capabilities, env } from "@/lib/env";
import { NoSegmentation } from "./none";
import { PhotoroomSegmentation } from "./photoroom";
import { RemoveBgSegmentation } from "./removebg";
import { RunpodSegmentation } from "./runpod";
import type { SegmentationProvider } from "./types";

export * from "./types";
export * from "./mask";

export type SegmentationStatus = { available: boolean; provider: string; reason: string | null };

/** Human-readable status for the UI and job logs. Never hides why a provider is off. */
export function segmentationStatus(): SegmentationStatus {
  const p = env.STUDIO_SEGMENTATION_PROVIDER;
  if (env.CLOVER_DEMO_MODE) return { available: false, provider: "none", reason: "Demo mode is on — studio runs as enhancement only" };
  if (p === "none") return { available: false, provider: "none", reason: "No segmentation provider configured — enhancing instead" };
  if (!capabilities.segmentation) return { available: false, provider: p, reason: `STUDIO_SEGMENTATION_PROVIDER is "${p}" but its API key is missing — enhancing instead` };
  return { available: true, provider: p, reason: null };
}

let cached: SegmentationProvider | null = null;

/** The configured provider, or a `NoSegmentation` stub that throws `SegmentationUnavailable`. */
export function getSegmentationProvider(): SegmentationProvider {
  if (cached) return cached;
  const status = segmentationStatus();
  if (!status.available) return (cached = new NoSegmentation(status.reason ?? undefined));
  switch (env.STUDIO_SEGMENTATION_PROVIDER) {
    case "photoroom":
      cached = new PhotoroomSegmentation(env.PHOTOROOM_API_KEY!);
      break;
    case "removebg":
      cached = new RemoveBgSegmentation(env.REMOVEBG_API_KEY!);
      break;
    case "runpod":
      cached = new RunpodSegmentation(env.RUNPOD_API_KEY!, env.RUNPOD_SEGMENT_ENDPOINT_ID!);
      break;
    default:
      cached = new NoSegmentation();
  }
  return cached;
}
