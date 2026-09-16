/**
 * Segmentation providers separate the item from its background. They return a cut-out (PNG with
 * alpha) and a mask (single-channel PNG); the compositor only ever *places* the cut-out — it
 * never repaints item pixels.
 */
export type SegmentationResult = {
  /** PNG RGBA, same dimensions as the input. */
  cutout: Buffer;
  /** PNG, one channel (L), same dimensions as the input. 255 = item. */
  mask: Buffer;
  /** Fraction of the frame covered by the item (0..1). */
  coverage: number;
  /** Provider name for provenance. */
  provider: string;
  /** Model identifier when known. */
  model?: string;
};

export interface SegmentationProvider {
  readonly name: string;
  segment(image: Buffer): Promise<SegmentationResult>;
}

/** No provider is configured. Callers fall back to enhancement only. */
export class SegmentationUnavailable extends Error {
  constructor(message = "No segmentation provider configured — enhancing instead") {
    super(message);
    this.name = "SegmentationUnavailable";
  }
}

/** The provider ran but the result is unusable (bad coverage, API error). Message is user-facing. */
export class SegmentationFailed extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SegmentationFailed";
  }
}

export const COVERAGE_MESSAGE = "Couldn't separate the item from the background — try a photo with more contrast";
