import { randomUUID } from "node:crypto";
import { db, type Job, type JobType, type Prisma } from "../db";
import { claimNextJob, emitJobEvent, heartbeat } from "./queue";
import { JobRetryableError, type JobContext, type JobHandler, type JobStep } from "./types";

const registry = new Map<JobType, JobHandler<never, unknown>>();

export function registerJobHandler<P extends Record<string, unknown>, R>(type: JobType, handler: JobHandler<P, R>) {
  registry.set(type, handler as unknown as JobHandler<never, unknown>);
}

export function getRegisteredJobTypes(): JobType[] {
  return [...registry.keys()];
}

async function persistSteps(jobId: string, steps: JobStep[]) {
  await db.job.update({ where: { id: jobId }, data: { steps: steps as unknown as Prisma.InputJsonValue } });
}

export async function runJob(job: Job, signal: AbortSignal): Promise<void> {
  const handler = registry.get(job.type);
  if (!handler) {
    await failJob(job, new Error(`No handler registered for job type ${job.type}`), false);
    return;
  }
  const steps: JobStep[] = Array.isArray(job.steps) ? (job.steps as unknown as JobStep[]) : [];
  const upsertStep = (key: string, label: string) => {
    let s = steps.find((x) => x.key === key);
    if (!s) {
      s = { key, label, status: "pending" };
      steps.push(s);
    }
    s.label = label;
    return s;
  };

  const ctx: JobContext = {
    job: {
      id: job.id,
      type: job.type,
      userId: job.userId,
      itemId: job.itemId,
      payload: (job.payload ?? {}) as Record<string, unknown>,
      steps,
      attempts: job.attempts,
    },
    payload: (job.payload ?? {}) as Record<string, unknown>,
    signal,
    async step(key, label, fn) {
      const s = upsertStep(key, label);
      s.status = "running";
      s.startedAt = new Date().toISOString();
      s.detail = undefined;
      await persistSteps(job.id, steps);
      await emitJobEvent(job.id, { kind: "step_started", stepKey: key, message: label });
      try {
        const result = await fn(async (detail, data) => {
          s.detail = detail;
          await persistSteps(job.id, steps);
          await heartbeat(job.id);
          await emitJobEvent(job.id, { kind: "step_progress", stepKey: key, message: detail, data });
        });
        s.status = "done";
        s.finishedAt = new Date().toISOString();
        await persistSteps(job.id, steps);
        await emitJobEvent(job.id, { kind: "step_finished", stepKey: key, message: s.detail ?? label });
        return result;
      } catch (err) {
        s.status = "failed";
        s.finishedAt = new Date().toISOString();
        s.detail = err instanceof Error ? err.message : String(err);
        await persistSteps(job.id, steps);
        await emitJobEvent(job.id, { kind: "step_failed", stepKey: key, message: s.detail });
        throw err;
      }
    },
    async skip(key, label, reason) {
      const s = upsertStep(key, label);
      s.status = "skipped";
      s.detail = reason;
      s.finishedAt = new Date().toISOString();
      await persistSteps(job.id, steps);
      await emitJobEvent(job.id, { kind: "step_skipped", stepKey: key, message: reason });
    },
    async log(message, data) {
      await emitJobEvent(job.id, { kind: "log", message, data });
    },
  };

  try {
    const result = await handler(ctx as never);
    await db.job.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), result: (result ?? null) as Prisma.InputJsonValue, lockedAt: null, lockedBy: null },
    });
    await emitJobEvent(job.id, { kind: "job_finished", message: "Done" });
  } catch (err) {
    const retryable = err instanceof JobRetryableError && job.attempts < job.maxAttempts;
    await failJob(job, err, retryable, err instanceof JobRetryableError ? err.delayMs : 0);
  }
}

async function failJob(job: Job, err: unknown, retry: boolean, delayMs = 0) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[jobs] ${job.type} ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}):`, message);
  if (retry) {
    await db.job.update({
      where: { id: job.id },
      data: { status: "QUEUED", runAfter: new Date(Date.now() + delayMs), error: message, lockedAt: null, lockedBy: null },
    });
    await emitJobEvent(job.id, { kind: "log", message: `Retrying: ${message}` });
  } else {
    await db.job.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), error: message, lockedAt: null, lockedBy: null } });
    await emitJobEvent(job.id, { kind: "job_failed", message });
  }
}

export type WorkerHandle = { stop: () => Promise<void>; id: string };

/** Poll loop. Safe to run in-process (dev) or as a dedicated process (prod). */
export function startWorker(opts: { pollMs?: number; concurrency?: number; types?: JobType[] } = {}): WorkerHandle {
  const id = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  const pollMs = opts.pollMs ?? 750;
  const concurrency = opts.concurrency ?? 2;
  const controller = new AbortController();
  let active = 0;
  let stopped = false;
  const inflight = new Set<Promise<void>>();

  const tick = async () => {
    while (!stopped && active < concurrency) {
      const job = await claimNextJob(id, opts.types).catch((e) => {
        console.error("[jobs] claim failed", e);
        return null;
      });
      if (!job) break;
      active++;
      const p = runJob(job, controller.signal)
        .catch((e) => console.error("[jobs] unhandled", e))
        .finally(() => {
          active--;
          inflight.delete(p);
        });
      inflight.add(p);
    }
  };

  const timer = setInterval(() => void tick(), pollMs);
  void tick();
  console.log(`[jobs] ${id} started (poll ${pollMs}ms, concurrency ${concurrency})`);

  return {
    id,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      controller.abort();
      await Promise.allSettled([...inflight]);
    },
  };
}

/** Run every queued job to completion synchronously — used by tests and the CLI. */
export async function drainQueue(maxJobs = 100): Promise<number> {
  let n = 0;
  while (n < maxJobs) {
    const job = await claimNextJob("drain");
    if (!job) break;
    await runJob(job, new AbortController().signal);
    n++;
  }
  return n;
}
