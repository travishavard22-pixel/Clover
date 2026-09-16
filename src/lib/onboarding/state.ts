import { z } from "zod";
import { db, type ConnectionStatus, type Marketplace } from "../db";
import { audit } from "../audit";
import { PreferencesPatchSchema, toPreferencesDTO, type PreferencesDTO } from "../settings/schema";
import { LAST_STEP, clampStep } from "./steps";

export const OnboardingPutSchema = z
  .object({
    step: z.number().int().min(0).max(LAST_STEP).optional(),
    prefs: PreferencesPatchSchema.optional(),
    complete: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.step !== undefined || b.prefs !== undefined || b.complete !== undefined, { message: "Nothing to update" });
export type OnboardingPut = z.infer<typeof OnboardingPutSchema>;

export type OnboardingConnection = { marketplace: Marketplace; status: ConnectionStatus; mode: string; accountName: string | null };

export type OnboardingState = {
  step: number;
  complete: boolean;
  preferences: PreferencesDTO;
  connections: OnboardingConnection[];
  itemCount: number;
};

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const [prefsRow, connections, itemCount] = await Promise.all([
    db.userPreferences.findUnique({ where: { userId } }).then((p) => p ?? db.userPreferences.create({ data: { userId } })),
    db.marketplaceConnection.findMany({ where: { userId }, select: { marketplace: true, status: true, mode: true, externalAccountName: true } }),
    db.item.count({ where: { userId } }),
  ]);
  return {
    step: clampStep(prefsRow.onboardingStep),
    complete: prefsRow.onboardingComplete,
    preferences: toPreferencesDTO(prefsRow),
    connections: connections.map((c) => ({ marketplace: c.marketplace, status: c.status, mode: c.mode, accountName: c.externalAccountName })),
    itemCount,
  };
}

/** Persists progress. `complete: true` also moves the step to the end so a revisit lands on the last screen. */
export async function updateOnboarding(userId: string, input: OnboardingPut, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<OnboardingState> {
  const data: Record<string, unknown> = { ...(input.prefs ?? {}) };
  if (input.step !== undefined) data.onboardingStep = clampStep(input.step);
  if (input.complete !== undefined) {
    data.onboardingComplete = input.complete;
    if (input.complete) data.onboardingStep = LAST_STEP;
  }
  await db.userPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  if (input.complete) await audit({ userId, action: "onboarding.completed", entityType: "user", entityId: userId, ...meta });
  return getOnboardingState(userId);
}
