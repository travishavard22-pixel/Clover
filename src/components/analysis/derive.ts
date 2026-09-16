import type { JobStepView } from "@/hooks/use-job-events";
import type { StepStatus } from "@/lib/jobs/types";

/**
 * Pure helpers that turn job-event state into what the analysis screen shows. Kept free of React
 * so the reveal logic and the live-region copy can be unit-tested.
 */

export type RevealData = { itemName: string | null; recommendedCents: number | null; basis: "MARKET_EVIDENCE" | "AI_ESTIMATE" | null; compsUsed: number | null };

function readString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object" && "value" in v) {
    const inner = (v as { value?: unknown }).value;
    if (typeof inner === "string" && inner.trim()) return inner.trim();
  }
  return null;
}

function readCents(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

/** Pulls the reveal facts out of the per-step data the worker reported. Missing facts stay null; nothing is invented. */
export function revealFromStepData(stepData: Record<string, Record<string, unknown>>): RevealData {
  const identify = stepData.identify ?? {};
  const verify = stepData.verify ?? {};
  const price = stepData.price ?? {};
  const itemName = readString(verify.itemName) ?? readString(identify.itemName) ?? readString(identify.title) ?? null;
  const recommendedCents = readCents(price.recommendedCents) ?? readCents(price.recommended) ?? null;
  const basisRaw = price.basis;
  const basis = basisRaw === "MARKET_EVIDENCE" || basisRaw === "AI_ESTIMATE" ? basisRaw : null;
  const compsUsed = typeof price.compsUsed === "number" ? price.compsUsed : null;
  return { itemName, recommendedCents, basis, compsUsed };
}

export type StepSummary = { total: number; done: number; running: JobStepView | null; failed: JobStepView | null; skipped: number };

export function summarizeSteps(steps: readonly JobStepView[]): StepSummary {
  return {
    total: steps.length,
    done: steps.filter((s) => s.status === "done").length,
    running: steps.find((s) => s.status === "running") ?? null,
    failed: steps.find((s) => s.status === "failed") ?? null,
    skipped: steps.filter((s) => s.status === "skipped").length,
  };
}

/** Sentence for the aria-live region when a step changes. Names the action and the object, never "loading". */
export function announcementFor(step: JobStepView): string {
  switch (step.status) {
    case "running":
      return step.detail ? `${step.label}: ${step.detail}` : `${step.label}…`;
    case "done":
      return step.detail && step.detail !== step.label ? `Done: ${step.label}. ${step.detail}` : `Done: ${step.label}`;
    case "failed":
      return `Failed: ${step.label}. ${step.detail ?? "No details were reported."}`;
    case "skipped":
      return `Skipped: ${step.label}. ${step.detail ?? ""}`.trim();
    default:
      return "";
  }
}

/** Human status word paired with the colour so meaning never relies on colour alone. */
export function statusWord(status: StepStatus): string {
  switch (status) {
    case "running":
      return "In progress";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return "Waiting";
  }
}

/** The keys of steps whose status changed between two renders, for announcements. */
export function changedStepKeys(prev: readonly JobStepView[], next: readonly JobStepView[]): string[] {
  const before = new Map(prev.map((s) => [s.key, `${s.status}|${s.detail ?? ""}`]));
  return next.filter((s) => before.get(s.key) !== `${s.status}|${s.detail ?? ""}`).map((s) => s.key);
}

export const SLOW_AFTER_MS = 90_000;
export const REVEAL_BEAT_MS = 700;
export const REVEAL_HOLD_MS = 2_200;
