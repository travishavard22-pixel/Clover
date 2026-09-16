import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises the durable queue end to end against the test database:
 * enqueue → claim (SKIP LOCKED) → steps + events → retry → success/failure.
 */
describe("job queue", async () => {
  const { db } = await import("@/lib/db");
  const { enqueueJob, getJobEvents, claimNextJob } = await import("@/lib/jobs/queue");
  const { registerJobHandler, runJob, drainQueue } = await import("@/lib/jobs/runner");
  const { JobRetryableError } = await import("@/lib/jobs/types");

  let attempts = 0;
  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
    await db.job.deleteMany({ where: { type: "EXPORT_DATA" } });
    registerJobHandler("EXPORT_DATA", async (ctx) => {
      const mode = (ctx.payload as { mode: string }).mode;
      await ctx.step("one", "Doing the first thing", async (report) => {
        await report("halfway through the first thing");
      });
      if (mode === "retry" && attempts++ === 0) throw new JobRetryableError("transient", 0);
      if (mode === "fail") {
        await ctx.step("two", "Failing on purpose", async () => {
          throw new Error("boom");
        });
      }
      await ctx.skip("three", "Optional thing", "not needed in test");
      return { ok: true, mode };
    });
  });
  afterAll(async () => {
    await db.job.deleteMany({ where: { type: "EXPORT_DATA" } });
    await db.$disconnect();
  });

  it("runs a job with real step events", async () => {
    const job = await enqueueJob("EXPORT_DATA", { mode: "ok" }, { steps: [{ key: "one", label: "Doing the first thing" }] });
    const n = await drainQueue();
    expect(n).toBeGreaterThanOrEqual(1);
    const done = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("SUCCEEDED");
    expect(done.result).toEqual({ ok: true, mode: "ok" });
    const steps = done.steps as Array<{ key: string; status: string; detail?: string }>;
    expect(steps.find((s) => s.key === "one")?.status).toBe("done");
    expect(steps.find((s) => s.key === "three")?.status).toBe("skipped");
    const events = await getJobEvents(job.id);
    expect(events.map((e) => e.kind)).toEqual(["step_started", "step_progress", "step_finished", "step_skipped", "job_finished"]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("retries retryable errors and then succeeds", async () => {
    attempts = 0;
    const job = await enqueueJob("EXPORT_DATA", { mode: "retry" });
    await drainQueue();
    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("SUCCEEDED");
    expect(after.attempts).toBe(2);
  });

  it("fails permanently on non-retryable errors and records the step failure", async () => {
    const job = await enqueueJob("EXPORT_DATA", { mode: "fail" });
    await drainQueue();
    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("FAILED");
    expect(after.error).toBe("boom");
    const steps = after.steps as Array<{ key: string; status: string }>;
    expect(steps.find((s) => s.key === "two")?.status).toBe("failed");
    const events = await getJobEvents(job.id);
    expect(events.at(-1)?.kind).toBe("job_failed");
  });

  it("claims each job exactly once", async () => {
    const job = await enqueueJob("EXPORT_DATA", { mode: "ok" });
    const [a, b] = await Promise.all([claimNextJob("w1", ["EXPORT_DATA"]), claimNextJob("w2", ["EXPORT_DATA"])]);
    const ids = [a?.id, b?.id].filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(job.id);
    for (const j of [a, b]) if (j) await runJob(j, new AbortController().signal);
  });
});
