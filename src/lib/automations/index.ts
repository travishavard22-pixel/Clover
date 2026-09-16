import { db } from "../db";
import { enqueueJob } from "../jobs/queue";

export * from "./types";
export * from "./registry";
export * from "./rules";
export * from "./dedupe";
export * from "./evaluators";
export { runAutomationsForUser, type RunSummary } from "./engine";
export { applyRecommendation, executeProposal, parseProposal, type ApplyResult } from "./apply";

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
