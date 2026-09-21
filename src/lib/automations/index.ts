import { db } from "../db";
import { enqueueJob } from "../jobs/queue";
import { AUTOMATIONS } from "./registry";

export * from "./types";
export * from "./registry";
export * from "./rules";
export * from "./dedupe";
export * from "./evaluators";
export { runAutomationsForUser, type RunSummary } from "./engine";
export { applyRecommendation, executeProposal, parseProposal, type ApplyResult } from "./apply";
export * from "./recommendations";

export const RUN_STEPS = [
  { key: "snapshot", label: "Reading your inventory" },
  { key: "evaluate", label: "Checking your automations" },
  { key: "act", label: "Writing recommendations and applying changes" },
];

export const RUN_ALL_STEPS = [
  { key: "users", label: "Finding sellers with automations" },
  { key: "evaluate", label: "Checking each seller's inventory" },
  { key: "summary", label: "Summarising the run" },
];

/** Enqueues a RUN_AUTOMATIONS job for one seller (the "Run now" button). */
export async function enqueueAutomationsForUser(userId: string) {
  return enqueueJob("RUN_AUTOMATIONS", { userId }, { userId, steps: RUN_STEPS, maxAttempts: 1 });
}

/**
 * Runs the sweep shortly after an item finishes analysis, so auto-publish lists it in a minute
 * rather than at the next scheduled sweep.
 *
 * Two details keep a bulk import from turning into a queue of identical sweeps: the run is delayed
 * by a minute, and a sweep already waiting for this seller is reused. Analysing fifty items in a
 * row therefore queues one sweep that sees all fifty.
 *
 * Returns null when the seller has auto-publish switched off — there is nothing time-sensitive to
 * do for them, and the scheduled sweep covers the rest.
 */
const ANALYSIS_SWEEP_DELAY_MS = 60_000;

export async function enqueueAutomationsAfterAnalysis(userId: string) {
  const rule = await db.automationRule.findUnique({ where: { userId_type: { userId, type: "AUTO_PUBLISH" } }, select: { mode: true } });
  const mode = rule?.mode ?? AUTOMATIONS.AUTO_PUBLISH.defaultMode;
  if (mode === "OFF") return null;
  const waiting = await db.job.findFirst({ where: { userId, type: "RUN_AUTOMATIONS", status: "QUEUED" }, select: { id: true } });
  if (waiting) return waiting;
  return enqueueJob("RUN_AUTOMATIONS", { userId }, { userId, steps: RUN_STEPS, maxAttempts: 1, runAfter: new Date(Date.now() + ANALYSIS_SWEEP_DELAY_MS) });
}

/** Enqueues one RUN_AUTOMATIONS job that covers every seller. Referenced by docs/runbooks/deployment.md. */
export async function enqueueAutomationsForAllUsers() {
  const job = await enqueueJob("RUN_AUTOMATIONS", {}, { steps: RUN_ALL_STEPS, maxAttempts: 2 });
  return job;
}

/** Sellers with at least one item — the population a scheduled run covers. */
export async function listAutomationUserIds(): Promise<string[]> {
  const rows = await db.user.findMany({ where: { items: { some: {} } }, select: { id: true }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => r.id);
}
