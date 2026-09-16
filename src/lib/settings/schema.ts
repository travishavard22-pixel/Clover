import { z } from "zod";
import type { PricingStrategy, Theme, UserPreferences } from "../db";

/**
 * Seller preferences as the client sees and edits them. Every field maps 1:1 to a column on
 * `UserPreferences`; onboarding fields are read-only here and changed through `src/lib/onboarding`.
 */
export const MARKETPLACE_VALUES = ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"] as const;
export const PRICING_STRATEGIES = ["QUICK_SALE", "BALANCED", "MAX_VALUE"] as const satisfies readonly PricingStrategy[];
export const THEMES = ["SYSTEM", "LIGHT", "DARK"] as const satisfies readonly Theme[];

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).nullable();

export const PreferencesPatchSchema = z
  .object({
    city: optionalText(80),
    region: optionalText(80),
    postalCode: optionalText(16),
    country: trimmed(2).toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter country code"),
    currency: trimmed(3).toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code"),
    offersLocalPickup: z.boolean(),
    offersShipping: z.boolean(),
    defaultShippingNote: optionalText(280),
    pricingStrategy: z.enum(PRICING_STRATEGIES),
    defaultMarketplaces: z.array(z.enum(MARKETPLACE_VALUES)).max(MARKETPLACE_VALUES.length),
    notifyOffers: z.boolean(),
    notifyStale: z.boolean(),
    notifyPublishing: z.boolean(),
    notifyEmail: z.boolean(),
    theme: z.enum(THEMES),
    reducedMotion: z.boolean(),
    expertMode: z.boolean(),
  })
  .partial()
  .strict()
  .superRefine((p, ctx) => {
    if (p.offersLocalPickup === false && p.offersShipping === false) {
      ctx.addIssue({ code: "custom", path: ["offersShipping"], message: "Keep at least one of shipping or local pickup on, or buyers have no way to receive the item." });
    }
    if (p.defaultMarketplaces && new Set(p.defaultMarketplaces).size !== p.defaultMarketplaces.length) {
      ctx.addIssue({ code: "custom", path: ["defaultMarketplaces"], message: "A marketplace is listed twice." });
    }
  });
export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>;

export const ProfilePatchSchema = z.object({ name: z.string().trim().min(1, "Add your name").max(80) }).strict();
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

export const SettingsPutSchema = z.object({ preferences: PreferencesPatchSchema.optional(), profile: ProfilePatchSchema.optional() }).refine((b) => b.preferences || b.profile, { message: "Nothing to update" });
export type SettingsPut = z.infer<typeof SettingsPutSchema>;

export type PreferencesDTO = {
  onboardingStep: number;
  onboardingComplete: boolean;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  currency: string;
  offersLocalPickup: boolean;
  offersShipping: boolean;
  defaultShippingNote: string | null;
  pricingStrategy: PricingStrategy;
  defaultMarketplaces: string[];
  notifyOffers: boolean;
  notifyStale: boolean;
  notifyPublishing: boolean;
  notifyEmail: boolean;
  theme: Theme;
  reducedMotion: boolean;
  expertMode: boolean;
  updatedAt: string;
};

export function toPreferencesDTO(p: UserPreferences): PreferencesDTO {
  return {
    onboardingStep: p.onboardingStep,
    onboardingComplete: p.onboardingComplete,
    city: p.city,
    region: p.region,
    postalCode: p.postalCode,
    country: p.country,
    currency: p.currency,
    offersLocalPickup: p.offersLocalPickup,
    offersShipping: p.offersShipping,
    defaultShippingNote: p.defaultShippingNote,
    pricingStrategy: p.pricingStrategy,
    defaultMarketplaces: p.defaultMarketplaces,
    notifyOffers: p.notifyOffers,
    notifyStale: p.notifyStale,
    notifyPublishing: p.notifyPublishing,
    notifyEmail: p.notifyEmail,
    theme: p.theme,
    reducedMotion: p.reducedMotion,
    expertMode: p.expertMode,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Which keys of a patch a caller changed — used for audit entries and to avoid no-op writes. */
export function changedKeys(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter((k) => patch[k] !== undefined);
}

export const PRICING_STRATEGY_COPY: Record<PricingStrategy, { label: string; description: string }> = {
  QUICK_SALE: { label: "Quick sale", description: "Price near the low end of the estimate so it moves in days, not weeks." },
  BALANCED: { label: "Balanced", description: "Price at the recommended figure. Most sellers pick this." },
  MAX_VALUE: { label: "Maximum value", description: "Price near the top of the estimate and wait for the right buyer." },
};
