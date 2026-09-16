import { SegmentationUnavailable, type SegmentationProvider, type SegmentationResult } from "./types";

/** Used when no provider is configured. Every call throws so callers must take the enhance-only path. */
export class NoSegmentation implements SegmentationProvider {
  readonly name = "none";
  constructor(private readonly reason = "No segmentation provider configured — enhancing instead") {}
  async segment(): Promise<SegmentationResult> {
    throw new SegmentationUnavailable(this.reason);
  }
}
