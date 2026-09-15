import { db, Prisma, type JobType } from "../db";
import type { JobEventPayload, JobStep } from "./types";

export type EnqueueOptions = {
  userId?: string | null;
  itemId?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
  /** Pre-declare the step plan so the UI can render the checklist immediately. */
  steps?: Array<{ key: string; label: string }>;
};

export async function enqueueJob(type: JobType, payload: Record<string, unknown>, opts: EnqueueOptions = {}) {
  const steps: JobStep[] = (opts.steps ?? []).map((s) => ({ ...s, status: "pending" }));
  return db.job.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      userId: opts.userId ?? null,
      itemId: opts.itemId ?? null,
      runAfter: opts.runAfter ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 3,
      steps: steps as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Atomically claim the next runnable job using SKIP LOCKED. */
export async function claimNextJob(workerId: string, types?: JobType[]) {
  const now = new Date();
  const staleLock = new Date(now.getTime() - 10 * 60 * 1000);
  const typeFilter = types && types.length ? types : null;
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH next AS (
      SELECT "id" FROM "Job"
      WHERE (("status" = 'QUEUED' AND "runAfter" <= ${now})
          OR ("status" = 'RUNNING' AND "lockedAt" < ${staleLock}))
        ${typeFilter ? Prisma.sql`AND "type"::text = ANY(${typeFilter}::text[])` : Prisma.empty}
      ORDER BY "runAfter" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "Job" j SET "status" = 'RUNNING', "lockedAt" = ${now}, "lockedBy" = ${workerId},
      "startedAt" = COALESCE(j."startedAt", ${now}), "attempts" = j."attempts" + 1, "updatedAt" = ${now}
    FROM next WHERE j."id" = next."id"
    RETURNING j."id"`;
  const id = rows[0]?.id;
  if (!id) return null;
  return db.job.findUnique({ where: { id } });
}

export async function emitJobEvent(jobId: string, ev: JobEventPayload) {
  // seq is derived inside a transaction to keep ordering strict.
  return db.$transaction(async (tx) => {
    const last = await tx.jobEvent.findFirst({ where: { jobId }, orderBy: { seq: "desc" }, select: { seq: true } });
    return tx.jobEvent.create({
      data: {
        jobId,
        seq: (last?.seq ?? 0) + 1,
        kind: ev.kind,
        stepKey: ev.stepKey,
        message: ev.message,
        data: (ev.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  });
}

export async function getJobEvents(jobId: string, afterSeq = 0) {
  return db.jobEvent.findMany({ where: { jobId, seq: { gt: afterSeq } }, orderBy: { seq: "asc" } });
}

export async function heartbeat(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { lockedAt: new Date() } });
}

export async function findLatestJobForItem(itemId: string, type: JobType) {
  return db.job.findFirst({ where: { itemId, type }, orderBy: { createdAt: "desc" } });
}
