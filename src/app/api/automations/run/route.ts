import { json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { enqueueAutomationsForUser, RUN_STEPS } from "@/lib/automations";
import { db } from "@/lib/db";

/** POST /api/automations/run → { jobId, steps } (3 per 10 minutes). Reuses a queued or running job instead of stacking a second one. */
export const POST = withUser(
  async (req, { user }) => {
    const active = await db.job.findFirst({ where: { userId: user.id, type: "RUN_AUTOMATIONS", status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" }, select: { id: true, steps: true } });
    if (active) return json({ jobId: active.id, steps: active.steps, reused: true });
    const job = await enqueueAutomationsForUser(user.id);
    await audit({ userId: user.id, action: "automation.run_requested", entityType: "job", entityId: job.id, ...requestMeta(req) });
    return json({ jobId: job.id, steps: RUN_STEPS, reused: false }, { status: 202 });
  },
  { rateLimit: { key: "automations.run", limit: 3, windowSeconds: 600 } },
);
