import { json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { EXPORT_LINK_TTL_SECONDS, EXPORT_STEPS, type ExportDataResult } from "@/lib/jobs/handlers/export-data";
import { signedFileUrl, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export type ExportStatus = {
  job: { id: string; status: string; steps: unknown; error: string | null; createdAt: string; finishedAt: string | null } | null;
  /** A fresh signed link to the latest finished archive, or null when there is none (or it was removed). */
  download: { url: string; bytes: number; expiresAt: string; createdAt: string; counts: ExportDataResult["counts"] } | null;
};

/** GET /api/account/export → ExportStatus (latest job + a fresh 24h link when the archive still exists) */
export const GET = withUser(async (_req, { user }) => {
  const [latest, lastDone] = await Promise.all([
    db.job.findFirst({ where: { userId: user.id, type: "EXPORT_DATA" }, orderBy: { createdAt: "desc" } }),
    db.job.findFirst({ where: { userId: user.id, type: "EXPORT_DATA", status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } }),
  ]);
  let download: ExportStatus["download"] = null;
  const result = lastDone?.result as ExportDataResult | null | undefined;
  if (lastDone && result?.key && result.key.startsWith(`users/${user.id}/`) && (await storage.exists(result.key))) {
    download = {
      url: signedFileUrl(result.key, EXPORT_LINK_TTL_SECONDS, false),
      bytes: result.bytes,
      expiresAt: new Date(Date.now() + EXPORT_LINK_TTL_SECONDS * 1000).toISOString(),
      createdAt: (lastDone.finishedAt ?? lastDone.createdAt).toISOString(),
      counts: result.counts,
    };
  }
  const status: ExportStatus = {
    job: latest ? { id: latest.id, status: latest.status, steps: latest.steps, error: latest.error, createdAt: latest.createdAt.toISOString(), finishedAt: latest.finishedAt?.toISOString() ?? null } : null,
    download,
  };
  return json(status);
});

/** POST /api/account/export → { jobId, steps } (2 per hour). An export already in progress is returned instead of starting another. */
export const POST = withUser(
  async (req, { user }) => {
    const active = await db.job.findFirst({ where: { userId: user.id, type: "EXPORT_DATA", status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" }, select: { id: true, steps: true } });
    if (active) return json({ jobId: active.id, steps: active.steps, reused: true });
    const job = await enqueueJob("EXPORT_DATA", { userId: user.id }, { userId: user.id, steps: EXPORT_STEPS, maxAttempts: 2 });
    await audit({ userId: user.id, action: "data.export_requested", entityType: "job", entityId: job.id, ...requestMeta(req) });
    return json({ jobId: job.id, steps: EXPORT_STEPS, reused: false }, { status: 202 });
  },
  { rateLimit: { key: "account.export", limit: 2, windowSeconds: 3600 } },
);
