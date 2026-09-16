import { db, type AutomationType, type Recommendation, type RecommendationStatus } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { AUTOMATIONS } from "./registry";
import type { ProposalPayload } from "./types";

export type RecommendationDTO = {
  id: string;
  type: AutomationType;
  typeName: string;
  itemId: string | null;
  itemTitle: string | null;
  title: string;
  body: string;
  status: RecommendationStatus;
  /** The action the recommendation would take, or null for purely informational ones. */
  action: ProposalPayload["action"] | null;
  /** Whether applying is meaningful (a real change, not just "noted"). */
  applicable: boolean;
  snoozedUntil: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

const STATUS_ORDER: Record<RecommendationStatus, number> = { OPEN: 0, SNOOZED: 1, APPLIED: 2, DISMISSED: 3 };

export function toRecommendationDTO(r: Recommendation & { item?: { title: string } | null }): RecommendationDTO {
  const proposal = r.proposal as Partial<ProposalPayload> | null;
  const action = proposal && typeof proposal.action === "string" ? proposal.action : null;
  return {
    id: r.id,
    type: r.type,
    typeName: AUTOMATIONS[r.type].name,
    itemId: r.itemId,
    itemTitle: r.item?.title ?? null,
    title: r.title,
    body: r.body,
    status: r.status,
    action,
    applicable: action !== null && action !== "notify" && action !== "review",
    snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  };
}

/** OPEN first, then snoozed, then resolved; newest first within each group. */
export async function listRecommendations(userId: string, opts: { limit?: number; status?: RecommendationStatus[]; type?: AutomationType } = {}): Promise<RecommendationDTO[]> {
  const rows = await db.recommendation.findMany({
    where: { userId, ...(opts.status ? { status: { in: opts.status } } : {}), ...(opts.type ? { type: opts.type } : {}) },
    include: { item: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 200,
  });
  return rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.getTime() - a.createdAt.getTime()).map(toRecommendationDTO);
}

export async function getOwnedRecommendation(userId: string, id: string) {
  const rec = await db.recommendation.findFirst({ where: { id, userId }, include: { item: { select: { title: true } } } });
  if (!rec) throw new ApiError(404, "Recommendation not found", "not_found");
  return rec;
}

export async function dismissRecommendation(userId: string, id: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const rec = await getOwnedRecommendation(userId, id);
  if (rec.status === "APPLIED") throw new ApiError(409, "This recommendation was already applied.", "already_resolved");
  const updated = await db.recommendation.update({ where: { id: rec.id }, data: { status: "DISMISSED", resolvedAt: new Date(), snoozedUntil: null }, include: { item: { select: { title: true } } } });
  await audit({ userId, action: "recommendation.dismiss", entityType: "recommendation", entityId: rec.id, meta: { type: rec.type, itemId: rec.itemId }, ...meta });
  return toRecommendationDTO(updated);
}

export const SNOOZE_MAX_DAYS = 90;

export async function snoozeRecommendation(userId: string, id: string, days: number, meta: { ip?: string | null; userAgent?: string | null }) {
  const rec = await getOwnedRecommendation(userId, id);
  if (rec.status === "APPLIED" || rec.status === "DISMISSED") throw new ApiError(409, `This recommendation was already ${rec.status.toLowerCase()}.`, "already_resolved");
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const updated = await db.recommendation.update({ where: { id: rec.id }, data: { status: "SNOOZED", snoozedUntil: until }, include: { item: { select: { title: true } } } });
  await audit({ userId, action: "recommendation.snooze", entityType: "recommendation", entityId: rec.id, meta: { type: rec.type, itemId: rec.itemId, days }, ...meta });
  return toRecommendationDTO(updated);
}

export type AutomationActivity = { id: string; title: string; status: RecommendationStatus; createdAt: string; resolvedAt: string | null; itemId: string | null };

/** The last few recommendations each automation produced — the "recent activity" line on its card. */
export async function recentActivityByType(userId: string, perType = 3): Promise<Record<AutomationType, AutomationActivity[]>> {
  const rows = await db.recommendation.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, type: true, title: true, status: true, createdAt: true, resolvedAt: true, itemId: true } });
  const out = {} as Record<AutomationType, AutomationActivity[]>;
  for (const type of Object.keys(AUTOMATIONS) as AutomationType[]) out[type] = [];
  for (const r of rows) {
    if (out[r.type].length >= perType) continue;
    out[r.type].push({ id: r.id, title: r.title, status: r.status, createdAt: r.createdAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() ?? null, itemId: r.itemId });
  }
  return out;
}

/** The last completed automation run for this seller, for the "last ran" line. */
export async function lastRunForUser(userId: string) {
  const job = await db.job.findFirst({ where: { userId, type: "RUN_AUTOMATIONS" }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, steps: true, result: true, createdAt: true, finishedAt: true } });
  if (!job) return null;
  return { id: job.id, status: job.status, steps: job.steps, result: job.result, createdAt: job.createdAt.toISOString(), finishedAt: job.finishedAt?.toISOString() ?? null };
}
