import { z } from "zod";
import { db, type AutomationMode, type AutomationType, type Prisma } from "../db";
import { ApiError } from "../api";
import { AUTOMATIONS, AUTOMATION_LIST, isModeSupported, parseConfigPatch, resolveConfig } from "./registry";
import type { AutomationConfig, AutomationDefinition } from "./types";
import { AUTOMATION_MODES, AUTOMATION_TYPES } from "./types";

export type ResolvedRule = {
  type: AutomationType;
  mode: AutomationMode;
  config: AutomationConfig;
  /** False until the seller has saved this rule at least once. */
  stored: boolean;
  updatedAt: string | null;
};

/** Mode as it will actually run: unsupported stored modes fall back to the definition's default. */
export function effectiveMode(def: AutomationDefinition, stored: AutomationMode | null): AutomationMode {
  if (stored && isModeSupported(def.type, stored)) return stored;
  return def.defaultMode;
}

export async function getRulesForUser(userId: string): Promise<ResolvedRule[]> {
  const rows = await db.automationRule.findMany({ where: { userId } });
  const byType = new Map(rows.map((r) => [r.type, r]));
  return AUTOMATION_LIST.map((def) => {
    const row = byType.get(def.type);
    return {
      type: def.type,
      mode: effectiveMode(def, row?.mode ?? null),
      config: resolveConfig(def.type, row?.config),
      stored: !!row,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
}

export function modesOf(rules: ResolvedRule[]): Record<AutomationType, AutomationMode> {
  const out = {} as Record<AutomationType, AutomationMode>;
  for (const t of AUTOMATION_TYPES) out[t] = rules.find((r) => r.type === t)?.mode ?? AUTOMATIONS[t].defaultMode;
  return out;
}

export const RulePatchSchema = z.object({
  type: z.enum(AUTOMATION_TYPES as [AutomationType, ...AutomationType[]]),
  mode: z.enum(AUTOMATION_MODES as [AutomationMode, ...AutomationMode[]]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type RulePatch = z.infer<typeof RulePatchSchema>;

export const RulesPutSchema = z.object({ rules: z.array(RulePatchSchema).min(1).max(AUTOMATION_TYPES.length) });

/** Validates and stores one rule change. Throws ApiError for unsupported modes so the UI can explain. */
export async function updateRule(userId: string, patch: RulePatch): Promise<ResolvedRule> {
  const def = AUTOMATIONS[patch.type] as AutomationDefinition;
  const existing = await db.automationRule.findUnique({ where: { userId_type: { userId, type: patch.type } } });
  const currentConfig = resolveConfig(patch.type, existing?.config);
  const mode = patch.mode ?? effectiveMode(def, existing?.mode ?? null);
  if (!isModeSupported(patch.type, mode)) {
    const reason = def.unsupportedReason?.[mode] ?? `${def.name} cannot run in this mode.`;
    throw new ApiError(400, reason, "unsupported_mode", { type: patch.type, mode });
  }
  const config = patch.config ? parseConfigPatch(patch.type, currentConfig, patch.config) : currentConfig;
  const row = await db.automationRule.upsert({
    where: { userId_type: { userId, type: patch.type } },
    create: { userId, type: patch.type, mode, config: config as Prisma.InputJsonValue },
    update: { mode, config: config as Prisma.InputJsonValue },
  });
  return { type: row.type, mode: row.mode, config, stored: true, updatedAt: row.updatedAt.toISOString() };
}
