import type { StudioModeId } from "./modes";
import { STUDIO_MODES } from "./modes";
import type { RenderPath } from "./provenance";

export type RenderStrategy = {
  path: RenderPath;
  /** What the `segment` step should do. */
  segment: "run" | "reuse" | "skip";
  /** Reason shown on a skipped segment step. */
  segmentReason?: string;
  /** Whether the QA gate runs (only composites need it). */
  qa: boolean;
  qaSkipReason?: string;
};

/** Decide how a mode renders given what is configured. Pure. */
export function decideStrategy(mode: StudioModeId, ctx: { segmentationAvailable: boolean; hasCachedMask: boolean; unavailableReason?: string | null }): RenderStrategy {
  const spec = STUDIO_MODES[mode];
  if (mode === "CONDITION") return { path: "condition", segment: "skip", segmentReason: "Condition photos keep the background — nothing to separate", qa: false, qaSkipReason: "Nothing was replaced; the original background and defects are kept" };
  if (mode === "DETAIL") return { path: "detail", segment: "skip", segmentReason: "Detail crops keep the background — nothing to separate", qa: false, qaSkipReason: "Nothing was replaced; this is a crop of the original" };
  if (!spec.needsSegmentation) return { path: "enhance", segment: "skip", segmentReason: "This mode does not separate the item", qa: false, qaSkipReason: "No background was replaced" };
  if (ctx.hasCachedMask) return { path: "composite", segment: "reuse", qa: true };
  if (ctx.segmentationAvailable) return { path: "composite", segment: "run", qa: true };
  return {
    path: "enhance",
    segment: "skip",
    segmentReason: ctx.unavailableReason ?? "No segmentation provider configured — enhancing instead",
    qa: false,
    qaSkipReason: "Enhancement only — no pixels were replaced, so there is nothing to compare",
  };
}
