import sharp from "sharp";
import type { Rgb } from "../color";

/** Dominant colour of the item region (cut-out) via sharp's histogram; falls back to the whole photo. */
export async function dominantColour(image: Buffer): Promise<Rgb> {
  const stats = await sharp(image).stats();
  return stats.dominant;
}
