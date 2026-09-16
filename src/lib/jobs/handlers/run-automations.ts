import type { registerJobHandler } from "../runner";
import { runAutomationsForUser, type RunSummary } from "../../automations/engine";
import { listAutomationUserIds } from "../../automations";

type Payload = { userId?: string };

export type RunAutomationsResult = {
  users: number;
  proposals: number;
  created: number;
  autoApplied: number;
  autoFailed: number;
  duplicates: number;
  notified: number;
  resolved: number;
  failures: Array<{ userId: string; error: string }>;
  /** Present for single-seller runs so the UI can show exactly what happened. */
  summary?: RunSummary;
};

/**
 * RUN_AUTOMATIONS — payload `{ userId? }`. With a userId it runs for that seller (the "Run now"
 * button); without one it sweeps every seller (the nightly cron). Each seller is isolated: one
 * failure is recorded and the sweep continues.
 */
export function register(r: typeof registerJobHandler) {
  r<Payload, RunAutomationsResult>("RUN_AUTOMATIONS", async (ctx) => {
    const result: RunAutomationsResult = { users: 0, proposals: 0, created: 0, autoApplied: 0, autoFailed: 0, duplicates: 0, notified: 0, resolved: 0, failures: [] };
    const fold = (s: RunSummary) => {
      result.users += 1;
      result.proposals += s.proposals;
      result.created += s.created;
      result.autoApplied += s.autoApplied;
      result.autoFailed += s.autoFailed;
      result.duplicates += s.duplicates;
      result.notified += s.notified;
      result.resolved += s.resolved;
    };

    if (ctx.payload.userId) {
      const userId = ctx.payload.userId;
      let summary: RunSummary | null = null;
      await ctx.step("snapshot", "Reading your inventory", async (report) => {
        await report("Loading rules, items, listings and offers");
      });
      await ctx.step("evaluate", "Checking your automations", async (report) => {
        summary = await runAutomationsForUser(userId, { report: async (detail, data) => report(detail, data) });
        await report(`${summary.proposals} finding${summary.proposals === 1 ? "" : "s"}, ${summary.duplicates} already known`, { proposals: summary.proposals, duplicates: summary.duplicates });
      });
      await ctx.step("act", "Writing recommendations and applying changes", async (report) => {
        const s = summary!;
        const parts = [`${s.created} new recommendation${s.created === 1 ? "" : "s"}`];
        if (s.autoApplied) parts.push(`${s.autoApplied} applied automatically`);
        if (s.autoFailed) parts.push(`${s.autoFailed} could not be applied`);
        if (s.notified) parts.push(`${s.notified} notification${s.notified === 1 ? "" : "s"}`);
        if (s.resolved) parts.push(`${s.resolved} outdated cleared`);
        await report(parts.join(", "), { created: s.created, autoApplied: s.autoApplied, autoFailed: s.autoFailed, notified: s.notified, resolved: s.resolved, applied: s.applied });
      });
      fold(summary!);
      result.summary = summary!;
      return result;
    }

    const userIds = await ctx.step("users", "Finding sellers with automations", async (report) => {
      const ids = await listAutomationUserIds();
      await report(`${ids.length} seller${ids.length === 1 ? "" : "s"} to check`, { users: ids.length });
      return ids;
    });
    await ctx.step("evaluate", "Checking each seller's inventory", async (report) => {
      let n = 0;
      for (const userId of userIds) {
        if (ctx.signal.aborted) throw new Error("Worker is shutting down");
        n += 1;
        try {
          const s = await runAutomationsForUser(userId);
          fold(s);
          await report(`Seller ${n} of ${userIds.length}: ${s.created} new, ${s.autoApplied} applied`, { done: n, total: userIds.length });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          result.failures.push({ userId, error });
          console.error(`[automations] run failed for ${userId}:`, error);
          await report(`Seller ${n} of ${userIds.length}: failed (${error})`, { done: n, total: userIds.length, failed: true });
        }
      }
    });
    await ctx.step("summary", "Summarising the run", async (report) => {
      await report(`${result.users} sellers, ${result.created} recommendations, ${result.autoApplied} automatic changes, ${result.failures.length} failures`, { ...result, summary: undefined });
    });
    return result;
  });
}
