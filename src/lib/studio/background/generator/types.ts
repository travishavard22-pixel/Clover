import type { Size } from "../../geometry";

/**
 * Background generators synthesise a scene *around* the item for LIFESTYLE mode.
 * The inverted mask locks item pixels; the compositor still re-places the original cut-out on
 * top of whatever comes back, so the item is byte-identical regardless of generator behaviour.
 */
export type GenerateBackgroundInput = {
  /** Source photo (JPEG/PNG). */
  source: Buffer;
  /** Item mask (PNG L, 255 = item). Generators inpaint everything that is NOT item. */
  mask: Buffer;
  /** Scene description, e.g. "soft daylight on a light oak table, out-of-focus plant". */
  prompt: string;
  size: Size;
};

export type GenerateBackgroundOutput = {
  /** PNG RGB at exactly `size`. */
  image: Buffer;
  model: string;
};

export interface BackgroundGenerator {
  readonly name: string;
  generate(input: GenerateBackgroundInput): Promise<GenerateBackgroundOutput>;
}

export class GeneratorUnavailable extends Error {
  constructor(message = "No background generator configured") {
    super(message);
    this.name = "GeneratorUnavailable";
  }
}
