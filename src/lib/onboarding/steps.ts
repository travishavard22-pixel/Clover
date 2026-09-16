/**
 * The onboarding sequence. Steps are addressed by index (persisted as `onboardingStep`) and by
 * slug (in the URL: `/onboarding?step=3`). Every step can be skipped; the flow is resumable.
 */
export const ONBOARDING_STEPS = [
  { slug: "welcome", title: "Welcome" },
  { slug: "how-it-works", title: "How it works" },
  { slug: "connect", title: "Connect marketplaces" },
  { slug: "selling", title: "Selling preferences" },
  { slug: "location", title: "Location" },
  { slug: "pricing", title: "Pricing strategy" },
  { slug: "notifications", title: "Notifications" },
  { slug: "first-item", title: "Scan your first item" },
] as const;

export type OnboardingSlug = (typeof ONBOARDING_STEPS)[number]["slug"];
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;
export const LAST_STEP = ONBOARDING_STEP_COUNT - 1;

export function clampStep(n: unknown): number {
  const v = typeof n === "string" ? Number(n) : typeof n === "number" ? n : NaN;
  if (!Number.isFinite(v)) return 0;
  return Math.min(LAST_STEP, Math.max(0, Math.trunc(v)));
}

/** Resolves `?step=` (index or slug) against the persisted step. The URL wins when present. */
export function resolveStep(query: string | string[] | undefined, persisted: number): number {
  const raw = Array.isArray(query) ? query[0] : query;
  if (raw === undefined || raw === "") return clampStep(persisted);
  const bySlug = ONBOARDING_STEPS.findIndex((s) => s.slug === raw);
  if (bySlug >= 0) return bySlug;
  return clampStep(raw);
}
