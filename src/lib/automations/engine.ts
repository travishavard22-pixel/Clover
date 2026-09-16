import { db, Prisma, type AutomationType } from "../db";
import { audit } from "../audit";
import { notify } from "../notifications";
import { executeProposal } from "./apply";
import { dedupeProposals, proposalKeyOf, type ExistingRecommendation } from "./dedupe";
import { evaluate } from "./evaluators";
import { AUTOMATIONS } from "./registry";
import { getRulesForUser, modesOf } from "./rules";
import { buildEvaluationContext } from "./snapshot";
import type { AutomationConfigMap, Proposal, SnapshotPreferences } from "./types";

export type RunSummary = {
  userId: string;
  items: number;
  proposals: number;
  duplicates: number;
  created: number;
  autoApplied: number;
  autoFailed: number;
  asked: number;
  notified: number;
  resolved: number;
  woken: number;
  byType: Partial<Record<AutomationType, { proposals: number; created: number; applied: number }>>;
  applied: Array<{ type: AutomationType; title: string; summary: string }>;
};

export type Reporter = (detail: string, data?: Record<string, unknown>) => Promise<void>;

const noop: Reporter = async () => {};

function canNotify(prefs: SnapshotPreferences, p: Proposal): boolean {
  if (!p.notifyPreference) return true;
  return prefs[p.notifyPreference];
}

/**
 * Evaluates every enabled automation for one seller and turns the proposals into
 * recommendations, notifications and (where the seller allowed it) applied changes.
 */
export async function runAutomationsForUser(userId: string, opts: { now?: Date; report?: Reporter } = {}): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const report = opts.report ?? noop;
  const summary: RunSummary = { userId, items: 0, proposals: 0, duplicates: 0, created: 0, autoApplied: 0, autoFailed: 0, asked: 0, notified: 0, resolved: 0, woken: 0, byType: {}, applied: [] };

  // 1. Snoozes that have expired come back as OPEN.
  const woken = await db.recommendation.updateMany({ where: { userId, status: "SNOOZED", snoozedUntil: { lte: now } }, data: { status: "OPEN", snoozedUntil: null } });
  summary.woken = woken.count;

  // 2. Rules and the snapshot.
  const rules = await getRulesForUser(userId);
  const modes = modesOf(rules);
  const ctx = await buildEvaluationContext(userId, modes, now);
  summary.items = ctx.items.length;
  await report(`Read ${ctx.items.length} item${ctx.items.length === 1 ? "" : "s"}`, { items: ctx.items.length });

  // 3. Evaluate.
  const active = rules.filter((r) => r.mode !== "OFF");
  const proposals: Proposal[] = [];
  for (const rule of active) {
    const found = evaluate(rule.type, ctx, rule.config as AutomationConfigMap[typeof rule.type]);
    proposals.push(...found);
    summary.byType[rule.type] = { proposals: found.length, created: 0, applied: 0 };
    await report(`${AUTOMATIONS[rule.type].name}: ${found.length} finding${found.length === 1 ? "" : "s"}`, { type: rule.type, proposals: found.length });
  }
  summary.proposals = proposals.length;

  // 4. De-duplicate against what already exists.
  const since = new Date(now.getTime() - 120 * 86_400_000);
  const existingRows = await db.recommendation.findMany({
    where: { userId, OR: [{ status: { in: ["OPEN", "SNOOZED"] } }, { createdAt: { gte: since } }] },
    select: { id: true, type: true, itemId: true, status: true, proposal: true },
  });
  const existing: ExistingRecommendation[] = existingRows.map((r) => ({ id: r.id, type: r.type, itemId: r.itemId, status: r.status, key: proposalKeyOf(r.proposal) }));
  const { fresh, duplicates } = dedupeProposals(proposals, existing);
  summary.duplicates = duplicates.length;

  // 5. Act on each fresh proposal according to the rule's mode.
  const askedByType = new Map<AutomationType, Proposal[]>();
  for (const p of fresh) {
    const rule = active.find((r) => r.type === p.type)!;
    const stats = summary.byType[p.type]!;
    if (rule.mode === "AUTO" && p.autoExecutable) {
      try {
        const result = await executeProposal(userId, p.proposal, { source: "auto" });
        await db.recommendation.create({ data: { userId, itemId: p.itemId, type: p.type, title: p.title, body: p.body, proposal: p.proposal as unknown as Prisma.InputJsonValue, status: "APPLIED", resolvedAt: now } });
        summary.created += 1;
        summary.autoApplied += 1;
        stats.created += 1;
        stats.applied += 1;
        summary.applied.push({ type: p.type, title: p.title, summary: result.summary });
        await audit({ userId, action: "automation.auto_applied", entityType: "item", entityId: p.itemId ?? undefined, meta: { type: p.type, key: p.proposal.key, action: p.proposal.action, summary: result.summary } });
        if (canNotify(ctx.preferences, p)) {
          const href = p.proposal.action === "notify" ? p.proposal.href : p.itemId ? `/items/${p.itemId}` : "/automations";
          await notify(userId, { type: `automation.${p.type.toLowerCase()}`, title: p.title, body: p.proposal.action === "notify" || p.proposal.action === "review" ? p.body : result.summary, href });
          summary.notified += 1;
        }
        await report(`${AUTOMATIONS[p.type].name}: ${result.summary}`, { type: p.type, applied: true });
      } catch (err) {
        summary.autoFailed += 1;
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[automations] auto-apply failed for ${p.proposal.key}:`, reason);
        // Fall back to asking, with the reason attached so nothing is hidden.
        await createOpen({ ...p, body: `${p.body} Clover could not apply this automatically: ${reason}` });
        askedByType.set(p.type, [...(askedByType.get(p.type) ?? []), p]);
        summary.created += 1;
        stats.created += 1;
      }
      continue;
    }
    const body = rule.mode === "AUTO" && !p.autoExecutable && p.autoBlockedReason ? `${p.body} ${p.autoBlockedReason}` : p.body;
    await createOpen({ ...p, body });
    summary.created += 1;
    stats.created += 1;
    if (rule.mode === "ASK" || rule.mode === "AUTO") {
      summary.asked += 1;
      if (canNotify(ctx.preferences, p)) askedByType.set(p.type, [...(askedByType.get(p.type) ?? []), p]);
    }
  }

  // 6. One notification per automation for the things that need a decision.
  for (const [type, list] of askedByType) {
    const def = AUTOMATIONS[type];
    const title = list.length === 1 ? list[0]!.title : `${def.name}: ${list.length} things need a decision`;
    const body = list.length === 1 ? list[0]!.body : list.slice(0, 3).map((p) => p.title).join(" · ") + (list.length > 3 ? ` · and ${list.length - 3} more` : "");
    await notify(userId, { type: `automation.${type.toLowerCase()}.ask`, title, body, href: "/automations#pending" });
    summary.notified += 1;
  }

  // 7. Tidy: open recommendations about items that have since sold or been archived no longer apply.
  const doneItems = ctx.items.filter((i) => i.status === "SOLD" || i.status === "SHIPPED" || i.status === "COMPLETED").map((i) => i.id);
  const gone = await db.item.findMany({ where: { userId, status: "ARCHIVED" }, select: { id: true } });
  const resolvable: AutomationType[] = ["REPRICE_STALE", "STALE_LISTING", "PHOTO_QUALITY", "TITLE_QUALITY", "OFFER_ALERT", "PENDING_ACTION_REMINDER"];
  const resolved = await db.recommendation.updateMany({
    where: { userId, status: { in: ["OPEN", "SNOOZED"] }, type: { in: resolvable }, itemId: { in: [...doneItems, ...gone.map((g) => g.id)] } },
    data: { status: "DISMISSED", resolvedAt: now },
  });
  summary.resolved = resolved.count;

  await audit({ userId, action: "automation.run", meta: { proposals: summary.proposals, created: summary.created, autoApplied: summary.autoApplied, duplicates: summary.duplicates, resolved: summary.resolved } });
  return summary;

  async function createOpen(p: Proposal) {
    await db.recommendation.create({ data: { userId, itemId: p.itemId, type: p.type, title: p.title, body: p.body, proposal: p.proposal as unknown as Prisma.InputJsonValue, status: "OPEN" } });
  }
}
