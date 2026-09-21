/**
 * The heartbeat that makes Clover run unattended.
 *
 * Two jobs do the work that has to happen without anyone pressing a button:
 *
 * - **SYNC_MARKETPLACE** pulls new offers and orders from every connected marketplace. Without it
 *   an offer only appears after the seller opens the app and syncs by hand — which is the opposite
 *   of an offer inbox.
 * - **RUN_AUTOMATIONS** evaluates every seller's rules and executes the ones set to AUTO.
 *
 * Both used to be enqueued only by a button or an external cron the deployment may never have set
 * up, so a deployment could sit there doing nothing while looking healthy.
 *
 * The schedule lives in the job table rather than in a timer: the worker asks "is one due?" every
 * minute and enqueues it if so, which survives restarts, needs no cron, and behaves correctly with
 * several workers because the check runs inside a Postgres advisory lock. Every job it creates is
 * marked `scheduled: true` in its payload so hand-triggered runs are never mistaken for the
 * heartbeat.
 */
import { db, Prisma, type JobType } from "../db";
import { env } from "../env";
import { RUN_ALL_STEPS } from "../automations";

/** One lock for the whole scheduler; the check is short and rare, so there is nothing to contend. */
const LOCK_KEY = 8_143_2207;

/** Marks a job as created by the heartbeat rather than by a person. */
export const SCHEDULED = { scheduled: true } as const;

/** Minutes between marketplace syncs. Offers expire, so this is the tighter of the two. */
export const syncMinutes = (): number => env.CLOVER_SYNC_MINUTES;

/** Minutes between automation sweeps. */
export const sweepMinutes = (): number => env.CLOVER_SWEEP_MINUTES;

/**
 * True when the last heartbeat job of this kind is old enough that another is due.
 *
 * A job that is still queued or running counts as current whatever its age: the point is never to
 * stack work that has not finished, which is how a slow sync turns into a queue of syncs.
 */
export async function isDue(type: JobType, userId: string | null, everyMinutes: number, now: Date): Promise<boolean> {
  const pending = await db.job.findFirst({
    where: { type, userId, status: { in: ["QUEUED", "RUNNING"] }, payload: { path: ["scheduled"], equals: true } },
    select: { id: true },
  });
  if (pending) return false;
  const last = await db.job.findFirst({
    where: { type, userId, payload: { path: ["scheduled"], equals: true } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, finishedAt: true },
  });
  if (!last) return true;
  const since = (last.finishedAt ?? last.createdAt).getTime();
  return now.getTime() - since >= everyMinutes * 60_000;
}

/** Sellers with a marketplace connection Clover can actually call. */
export async function sellersToSync(): Promise<string[]> {
  const rows = await db.marketplaceConnection.findMany({
    where: { status: "CONNECTED", mode: { in: ["api", "demo"] } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId);
}

export type SweepResult = { syncs: number; automations: number };

/**
 * Enqueues whatever is due. Idempotent, and safe to call from every worker every minute.
 *
 * The advisory lock is transaction-scoped, so it is released even if this throws, and two workers
 * calling at the same moment cannot both decide the same job is due.
 */
export async function enqueueDueJobs(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = { syncs: 0, automations: 0 };
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;

    for (const userId of await sellersToSync()) {
      if (!(await isDue("SYNC_MARKETPLACE", userId, syncMinutes(), now))) continue;
      await tx.job.create({
        data: {
          type: "SYNC_MARKETPLACE",
          userId,
          payload: { userId, ...SCHEDULED } as Prisma.InputJsonValue,
          steps: [{ key: "sync", label: "Checking your marketplaces", status: "pending" }] as unknown as Prisma.InputJsonValue,
          maxAttempts: 2,
        },
      });
      result.syncs += 1;
    }

    if (await isDue("RUN_AUTOMATIONS", null, sweepMinutes(), now)) {
      await tx.job.create({
        data: {
          type: "RUN_AUTOMATIONS",
          payload: { ...SCHEDULED } as Prisma.InputJsonValue,
          steps: RUN_ALL_STEPS.map((s) => ({ ...s, status: "pending" })) as unknown as Prisma.InputJsonValue,
          maxAttempts: 2,
        },
      });
      result.automations += 1;
    }
  });
  return result;
}

export type SchedulerHandle = { stop: () => void };

/** Starts the heartbeat inside a worker process. One check a minute is plenty for minute-grained work. */
export function startScheduler(opts: { everyMs?: number } = {}): SchedulerHandle {
  const everyMs = opts.everyMs ?? 60_000;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { syncs, automations } = await enqueueDueJobs();
      if (syncs || automations) console.log(`[schedule] queued ${syncs} sync${syncs === 1 ? "" : "s"}, ${automations} sweep${automations === 1 ? "" : "s"}`);
    } catch (err) {
      // A scheduler that dies on one bad tick stops the whole product, so this only logs.
      console.error("[schedule] tick failed", err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), everyMs);
  void tick();
  console.log(`[schedule] heartbeat every ${Math.round(everyMs / 1000)}s (sync ${syncMinutes()}m, sweep ${sweepMinutes()}m)`);
  return { stop: () => clearInterval(timer) };
}
