import { NEUTRAL_OPTIONS, type StudioOptions } from "./options";

/**
 * The eight studio modes. Mirrors the Prisma `StudioMode` enum (asserted in the job handler).
 * This file is pure (no server imports) so the client can render the mode picker from it.
 */
export const STUDIO_MODE_IDS = ["CLEAN_STUDIO", "LUXURY", "LIFESTYLE", "ECOMMERCE", "MARKETPLACE", "SOCIAL", "DETAIL", "CONDITION"] as const;
export type StudioModeId = (typeof STUDIO_MODE_IDS)[number];

export type ModeSpec = {
  id: StudioModeId;
  /** User-facing name. */
  name: string;
  /** One calm sentence for the picker. */
  description: string;
  /** What the pipeline actually does, in plain words. Shown under the selected mode. */
  does: string;
  /** Needs a cut-out (segmentation). Without a provider the mode falls back to enhancement only. */
  needsSegmentation: boolean;
  /** Needs a background generator (LIFESTYLE). Without one it uses the blurred-original fallback. */
  usesGenerator: boolean;
  /** Never removes or replaces the background. */
  keepsBackground: boolean;
  /** Uses the focus point. */
  usesFocus: boolean;
  /** Fallback background colour when `background` is `auto`. */
  autoBackgroundHex: string;
  /** Output summary, e.g. "1:1 · white · PNG + JPEG". */
  output: string;
  /** Product-honesty note displayed with the mode. */
  honestyNote?: string;
  defaults: StudioOptions;
};

const base = (over: Partial<StudioOptions> & { crop?: Partial<StudioOptions["crop"]>; shadow?: Partial<StudioOptions["shadow"]> }): StudioOptions => ({
  ...NEUTRAL_OPTIONS,
  ...over,
  crop: { ...NEUTRAL_OPTIONS.crop, ...(over.crop ?? {}) },
  shadow: { ...NEUTRAL_OPTIONS.shadow, ...(over.shadow ?? {}) },
  colorBalance: { ...NEUTRAL_OPTIONS.colorBalance },
  focus: { ...NEUTRAL_OPTIONS.focus },
});

export const STUDIO_MODES: Record<StudioModeId, ModeSpec> = {
  CLEAN_STUDIO: {
    id: "CLEAN_STUDIO",
    name: "Clean studio",
    description: "Warm off-white background with a soft contact shadow. The default.",
    does: "Cuts the item out, places it on a neutral paper background with a subtle floor sweep and a soft contact shadow. Item pixels are untouched.",
    needsSegmentation: true,
    usesGenerator: false,
    keepsBackground: false,
    usesFocus: false,
    autoBackgroundHex: "#F8F7F3",
    output: "Original aspect · paper · JPEG",
    defaults: base({ background: "paper", lighting: "soft", crop: { aspect: "original", padding: 8 }, shadow: { type: "contact", opacity: 0.35, offset: 3 } }),
  },
  LUXURY: {
    id: "LUXURY",
    name: "Luxury",
    description: "Deep charcoal-to-black gradient with a subtle rim and vignette.",
    does: "Cuts the item out and places it on a dark radial gradient with a wider, softer shadow. Good for watches, jewellery and leather.",
    needsSegmentation: true,
    usesGenerator: false,
    keepsBackground: false,
    usesFocus: false,
    autoBackgroundHex: "#1A1B1A",
    output: "Original aspect · charcoal gradient · JPEG",
    defaults: base({ background: "charcoal", lighting: "dramatic", crop: { aspect: "original", padding: 10 }, shadow: { type: "soft", opacity: 0.55, offset: 2 } }),
  },
  LIFESTYLE: {
    id: "LIFESTYLE",
    name: "Lifestyle",
    description: "A contextual scene behind the item. Needs a background generator.",
    does: "Cuts the item out and generates a scene around it (the item itself is never regenerated). Without a generator, a softened version of the original background is used instead and labelled as such.",
    needsSegmentation: true,
    usesGenerator: true,
    keepsBackground: false,
    usesFocus: false,
    autoBackgroundHex: "#E9E8E4",
    output: "Original aspect · scene · JPEG · labelled AI background",
    honestyNote: "AI-generated backgrounds are always labelled and are never the first photo for used goods.",
    defaults: base({ background: "auto", lighting: "soft", crop: { aspect: "original", padding: 10 }, shadow: { type: "contact", opacity: 0.3, offset: 3 } }),
  },
  ECOMMERCE: {
    id: "ECOMMERCE",
    name: "E-commerce",
    description: "Pure white, square, item centred with 8% padding. Marketplace standard.",
    does: "Cuts the item out and centres it on #FFFFFF in a square frame. Also saves a PNG for marketplaces that prefer it.",
    needsSegmentation: true,
    usesGenerator: false,
    keepsBackground: false,
    usesFocus: false,
    autoBackgroundHex: "#FFFFFF",
    output: "1:1 · white · JPEG + PNG",
    defaults: base({ background: "white", lighting: "studio", crop: { aspect: "1:1", padding: 8 }, shadow: { type: "contact", opacity: 0.25, offset: 2 } }),
  },
  MARKETPLACE: {
    id: "MARKETPLACE",
    name: "Marketplace",
    description: "Light grey gradient, 4:3, item fills 85% — reads well as a thumbnail.",
    does: "Cuts the item out and fills 85% of a 4:3 frame on a light grey gradient so the item stays legible at thumbnail size.",
    needsSegmentation: true,
    usesGenerator: false,
    keepsBackground: false,
    usesFocus: false,
    autoBackgroundHex: "#EDECE8",
    output: "4:3 · light grey · JPEG",
    defaults: base({ background: "light-grey", lighting: "studio", crop: { aspect: "4:3", padding: 7.5 }, shadow: { type: "contact", opacity: 0.3, offset: 3 } }),
  },
  SOCIAL: {
    id: "SOCIAL",
    name: "Social",
    description: "Bold solid colour derived from the item, square, room for text.",
    does: "Cuts the item out and places it on a solid colour complementary to the item's dominant colour, with a generous margin for captions.",
    needsSegmentation: true,
    usesGenerator: false,
    keepsBackground: false,
    usesFocus: false,
    autoBackgroundHex: "#2F6F8F",
    output: "1:1 · bold colour · JPEG",
    defaults: base({ background: "auto", lighting: "soft", crop: { aspect: "1:1", padding: 18 }, shadow: { type: "drop", opacity: 0.3, offset: 4 } }),
  },
  DETAIL: {
    id: "DETAIL",
    name: "Detail",
    description: "2× crop on a point you choose, lightly sharpened.",
    does: "Crops to twice the magnification around the focus point and applies light sharpening. The background is kept. Pixels are resampled to enlarge.",
    needsSegmentation: false,
    usesGenerator: false,
    keepsBackground: true,
    usesFocus: true,
    autoBackgroundHex: "#F8F7F3",
    output: "Chosen aspect · 2× crop · JPEG",
    defaults: base({ background: "auto", crop: { aspect: "original", padding: 0 }, shadow: { type: "none", opacity: 0, offset: 0 } }),
  },
  CONDITION: {
    id: "CONDITION",
    name: "Condition",
    description: "Crops to a defect and rings it. Never removes the background.",
    does: "Crops around the focus point and draws a thin ring with an optional label. Nothing is removed, smoothed or enhanced.",
    needsSegmentation: false,
    usesGenerator: false,
    keepsBackground: true,
    usesFocus: true,
    autoBackgroundHex: "#F8F7F3",
    output: "Chosen aspect · ringed defect · JPEG",
    honestyNote: "Shows imperfections clearly. Never hides them.",
    defaults: base({ background: "auto", crop: { aspect: "original", padding: 0 }, shadow: { type: "none", opacity: 0, offset: 0 } }),
  },
};

export const STUDIO_MODE_LIST: ModeSpec[] = STUDIO_MODE_IDS.map((id) => STUDIO_MODES[id]);

export function isStudioMode(v: unknown): v is StudioModeId {
  return typeof v === "string" && (STUDIO_MODE_IDS as readonly string[]).includes(v);
}

export function modeSpec(mode: StudioModeId): ModeSpec {
  return STUDIO_MODES[mode];
}

/** Modes whose output is a `CONDITION` photo rather than a `STUDIO` one. */
export function photoKindForMode(mode: StudioModeId): "STUDIO" | "CONDITION" {
  return mode === "CONDITION" ? "CONDITION" : "STUDIO";
}
