import type { PUBLISH_STEPS } from "../analysis/steps";
import type { MarketplaceAdapter, PublishResult } from "./types";

export type PublishStepKey = (typeof PUBLISH_STEPS)[number]["key"];

/** Runs one named publish step, mirroring `JobContext.step` so real job events drive the UI checklist. */
export type StepRunner = <T>(key: PublishStepKey, label: string, fn: (report: (detail: string, data?: Record<string, unknown>) => Promise<void>) => Promise<T>) => Promise<T>;

export type PublishInput = Parameters<MarketplaceAdapter["publish"]>[0];

/**
 * API adapters that can expose their publish pipeline as the declared `PUBLISH_STEPS` (photos →
 * category → fees → publish). The job handler prefers this so every status line is a real step;
 * `publish()` remains available and simply runs the phases in sequence.
 */
export interface PhasedAdapter extends MarketplaceAdapter {
  publishPhased(input: PublishInput, run: StepRunner): Promise<PublishResult>;
}

export function isPhased(adapter: MarketplaceAdapter): adapter is PhasedAdapter {
  return typeof (adapter as Partial<PhasedAdapter>).publishPhased === "function";
}

/** A StepRunner that ignores step boundaries and forwards detail lines to a plain reporter. */
export function flatRunner(report: (msg: string) => Promise<void>): StepRunner {
  return async (_key, label, fn) => {
    await report(label);
    return fn(async (detail) => report(detail));
  };
}
