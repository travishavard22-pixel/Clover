import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta, audit } from "@/lib/audit";
import { AUTOMATION_LIST, getRulesForUser, RulePatchSchema, RulesPutSchema, updateRule } from "@/lib/automations";
import { lastRunForUser, recentActivityByType } from "@/lib/automations/recommendations";

export const dynamic = "force-dynamic";

/** GET /api/automations → { rules, registry, activity, lastRun } */
export const GET = withUser(async (_req, { user }) => {
  const [rules, activity, lastRun] = await Promise.all([getRulesForUser(user.id), recentActivityByType(user.id), lastRunForUser(user.id)]);
  return json({ rules, registry: AUTOMATION_LIST, activity, lastRun });
});

const PutSchema = z.union([RulePatchSchema, RulesPutSchema]);

/** PUT /api/automations with `{ type, mode?, config? }` or `{ rules: [...] }` → { rules: ResolvedRule[] } */
export const PUT = withUser(async (req, { user }) => {
  const body = await parseBody(req, PutSchema);
  const patches = "rules" in body ? body.rules : [body];
  const updated = [];
  for (const patch of patches) updated.push(await updateRule(user.id, patch));
  await audit({ userId: user.id, action: "automation.rule_updated", entityType: "automationRule", meta: { rules: updated.map((r) => ({ type: r.type, mode: r.mode })) }, ...requestMeta(req) });
  return json({ rules: updated });
});
