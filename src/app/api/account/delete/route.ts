import { z } from "zod";
import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs/queue";
import { DELETE_STEPS, type ListingToEnd } from "@/lib/jobs/handlers/delete-account";
import { MARKETPLACES } from "@/lib/marketplaces/registry";

const STILL_OPEN = ["READY", "NEEDS_ATTENTION", "PUBLISHING", "PUBLISHED", "REQUIRES_USER_ACTION"] as const;

async function liveListings(userId: string): Promise<ListingToEnd[]> {
  const pubs = await db.publication.findMany({ where: { userId, status: { in: [...STILL_OPEN] } }, include: { item: { select: { title: true } } }, orderBy: { createdAt: "asc" } });
  return pubs.map((p) => ({ marketplace: p.marketplace, marketplaceName: MARKETPLACES[p.marketplace].name, itemTitle: p.item.title, externalUrl: p.externalUrl, mode: p.mode }));
}

/**
 * GET /api/account/delete?jobId= → { job: { id, status, steps, error } } while the account still exists.
 * Once the job has deleted the user this returns 401, which the client treats as "done".
 */
export const GET = withUser(async (req, { user }) => {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) throw new ApiError(400, "jobId is required", "validation");
  const job = await db.job.findFirst({ where: { id: jobId, type: "DELETE_ACCOUNT", payload: { path: ["userId"], equals: user.id } }, select: { id: true, status: true, steps: true, error: true } });
  if (!job) throw new ApiError(404, "Job not found", "not_found");
  return json({ job });
});

const Body = z.object({ confirm: z.literal("DELETE") });

/**
 * POST /api/account/delete `{ confirm: "DELETE" }` → { jobId, steps, listingsToEnd }
 * Enqueues DELETE_ACCOUNT without a userId so the job record survives the cascade. The audit
 * trail keeps only a salted hash of the email. Every other session is revoked immediately; the
 * caller's session is ended by the client after it has read the job's outcome.
 */
export const POST = withUser(
  async (req, { user }) => {
    await parseBody(req, Body).catch(() => {
      throw new ApiError(400, 'Type DELETE to confirm.', "confirmation_required");
    });
    const existing = await db.job.findFirst({ where: { type: "DELETE_ACCOUNT", status: { in: ["QUEUED", "RUNNING"] }, payload: { path: ["userId"], equals: user.id } }, select: { id: true, steps: true } });
    if (existing) return json({ jobId: existing.id, steps: existing.steps, listingsToEnd: await liveListings(user.id), reused: true });

    const emailHash = sha256(`${env.BETTER_AUTH_SECRET}:${user.email.trim().toLowerCase()}`);
    const requestedAt = new Date().toISOString();
    const meta = requestMeta(req);
    const listingsToEnd = await liveListings(user.id);
    // Audit while the user still exists so the request itself is attributable; the job's own entry is anonymous.
    await audit({ userId: user.id, action: "account.delete_requested", entityType: "user", entityId: user.id, meta: { emailHash, listingsToEnd: listingsToEnd.length }, ...meta });
    const job = await enqueueJob("DELETE_ACCOUNT", { userId: user.id, emailHash, requestedAt }, { userId: null, steps: DELETE_STEPS, maxAttempts: 3 });
    return json({ jobId: job.id, steps: DELETE_STEPS, listingsToEnd, reused: false }, { status: 202 });
  },
  { rateLimit: { key: "account.delete", limit: 3, windowSeconds: 3600 } },
);
