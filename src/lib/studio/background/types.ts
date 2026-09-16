import type { Size } from "../geometry";

/** A rendered background: PNG RGB at exactly `size`. */
export type RenderedBackground = {
  image: Buffer;
  size: Size;
  /** Renderer id for provenance ("solid", "gradient", "studio-sweep", "blurred-original", "generator:<name>"). */
  kind: string;
  /** True for pure #FFFFFF, which also gets a PNG export. */
  isPureWhite: boolean;
  /** Extra user-facing note, e.g. "Soft background (no generator configured)". */
  note?: string;
  /** Model used when a generator produced the pixels. */
  model?: string;
};
