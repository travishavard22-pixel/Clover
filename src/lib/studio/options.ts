import { z } from "zod";

/**
 * Studio options — the user-adjustable controls for a render.
 *
 * Everything here changes only the *presentation* of the item (background, shadow, framing,
 * global colour balance). Nothing regenerates item geometry.
 *
 * Why there is no `angle` option: turning an item to a new angle means inventing the parts of
 * it the camera never saw. That would alter the item and make the photo untrue. The only
 * geometric control we expose is `flipHorizontal`, which mirrors the whole photo without
 * inventing pixels (and is off by default because it mirrors text and logos).
 */

export const BACKGROUND_PRESETS = [
  { id: "paper", name: "Paper", hex: "#F8F7F3", description: "Warm off-white — matches Clover" },
  { id: "white", name: "Pure white", hex: "#FFFFFF", description: "Marketplace standard" },
  { id: "light-grey", name: "Light grey", hex: "#E9E8E4", description: "Neutral, soft" },
  { id: "stone", name: "Stone", hex: "#D6D3CC", description: "Warm mid grey" },
  { id: "sand", name: "Sand", hex: "#EFE6D6", description: "Warm, editorial" },
  { id: "sage", name: "Sage", hex: "#DDF2E6", description: "Soft green tint" },
  { id: "charcoal", name: "Charcoal", hex: "#2A2B29", description: "Deep neutral" },
  { id: "black", name: "Black", hex: "#121312", description: "For luxury goods" },
] as const;

export type BackgroundPresetId = (typeof BACKGROUND_PRESETS)[number]["id"];

export const HEX_COLOUR = /^#(?:[0-9a-fA-F]{6})$/;

const presetIds = BACKGROUND_PRESETS.map((p) => p.id) as [BackgroundPresetId, ...BackgroundPresetId[]];

/** `auto` lets the mode pick (e.g. SOCIAL derives a colour from the item). */
export const BackgroundSchema = z.union([z.literal("auto"), z.enum(presetIds), z.string().regex(HEX_COLOUR, "Use a 6-digit hex colour such as #F8F7F3")]);

export const LightingSchema = z.enum(["soft", "studio", "dramatic"]);
export type Lighting = z.infer<typeof LightingSchema>;

export const AspectSchema = z.enum(["original", "1:1", "4:3", "3:4", "16:9"]);
export type Aspect = z.infer<typeof AspectSchema>;

export const ShadowTypeSchema = z.enum(["none", "contact", "soft", "drop"]);
export type ShadowType = z.infer<typeof ShadowTypeSchema>;

export const StudioOptionsSchema = z.object({
  /** Background preset id, a hex colour, or `auto` (mode decides). */
  background: BackgroundSchema,
  /** Affects shadow softness/strength and vignette. */
  lighting: LightingSchema,
  /** Mirrors the whole photo. Never invents pixels; text and logos will read backwards. */
  flipHorizontal: z.boolean(),
  crop: z.object({
    aspect: AspectSchema,
    /** Space around the item as a percentage of the frame's short edge (0–30). */
    padding: z.number().min(0).max(30),
  }),
  shadow: z.object({
    type: ShadowTypeSchema,
    opacity: z.number().min(0).max(1),
    /** Vertical offset as a percentage of the item's height (0–10). */
    offset: z.number().min(0).max(10),
  }),
  /** Global colour balance. Default is neutral — colour must stay true. Applies to the whole composite, item included. */
  colorBalance: z.object({
    temperature: z.number().min(-100).max(100),
    exposure: z.number().min(-1).max(1),
  }),
  /** Focus point (0..1 of width/height) for DETAIL and CONDITION. */
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  /** Caption drawn on CONDITION renders, e.g. "Scratch on the lid". */
  label: z.string().max(60),
});

export type StudioOptions = z.infer<typeof StudioOptionsSchema>;

/** Partial input accepted from the client. Missing keys fall back to the mode defaults. */
export const StudioOptionsInputSchema = z.object({
  background: BackgroundSchema.optional(),
  lighting: LightingSchema.optional(),
  flipHorizontal: z.boolean().optional(),
  crop: z.object({ aspect: AspectSchema.optional(), padding: z.number().min(0).max(30).optional() }).optional(),
  shadow: z.object({ type: ShadowTypeSchema.optional(), opacity: z.number().min(0).max(1).optional(), offset: z.number().min(0).max(10).optional() }).optional(),
  colorBalance: z.object({ temperature: z.number().min(-100).max(100).optional(), exposure: z.number().min(-1).max(1).optional() }).optional(),
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  label: z.string().max(60).optional(),
});

export type StudioOptionsInput = z.infer<typeof StudioOptionsInputSchema>;

export const NEUTRAL_OPTIONS: StudioOptions = {
  background: "auto",
  lighting: "soft",
  flipHorizontal: false,
  crop: { aspect: "original", padding: 8 },
  shadow: { type: "contact", opacity: 0.35, offset: 3 },
  colorBalance: { temperature: 0, exposure: 0 },
  focus: { x: 0.5, y: 0.5 },
  label: "",
};

/** Deep-merge a partial input over a full option set. Pure. */
export function mergeOptions(base: StudioOptions, input: StudioOptionsInput | undefined): StudioOptions {
  if (!input) return { ...base, crop: { ...base.crop }, shadow: { ...base.shadow }, colorBalance: { ...base.colorBalance }, focus: { ...base.focus } };
  return {
    background: input.background ?? base.background,
    lighting: input.lighting ?? base.lighting,
    flipHorizontal: input.flipHorizontal ?? base.flipHorizontal,
    crop: { aspect: input.crop?.aspect ?? base.crop.aspect, padding: input.crop?.padding ?? base.crop.padding },
    shadow: { type: input.shadow?.type ?? base.shadow.type, opacity: input.shadow?.opacity ?? base.shadow.opacity, offset: input.shadow?.offset ?? base.shadow.offset },
    colorBalance: { temperature: input.colorBalance?.temperature ?? base.colorBalance.temperature, exposure: input.colorBalance?.exposure ?? base.colorBalance.exposure },
    focus: input.focus ? { ...input.focus } : { ...base.focus },
    label: input.label ?? base.label,
  };
}

/** True when the user asked for a global colour change (which also touches item pixels). */
export function colourBalanceRequested(o: StudioOptions): boolean {
  return o.colorBalance.temperature !== 0 || o.colorBalance.exposure !== 0;
}

/** Resolve a background option to a hex colour. `auto` → the mode's fallback. */
export function resolveBackgroundHex(background: StudioOptions["background"], fallbackHex: string): string {
  if (background === "auto") return fallbackHex;
  const preset = BACKGROUND_PRESETS.find((p) => p.id === background);
  if (preset) return preset.hex;
  return background.toUpperCase();
}

export const ANGLE_NOTE =
  "Angle can't be changed. Turning the item would mean inventing the parts the camera never saw, which would alter the item. Reshoot from another angle instead; flipping mirrors the photo without inventing anything.";
