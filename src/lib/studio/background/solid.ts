import sharp from "sharp";
import { isPureWhite } from "../color";
import type { Size } from "../geometry";
import type { RenderedBackground } from "./types";

export async function renderSolid(size: Size, hex: string): Promise<RenderedBackground> {
  const image = await sharp({ create: { width: size.width, height: size.height, channels: 3, background: hex } }).png().toBuffer();
  return { image, size, kind: "solid", isPureWhite: isPureWhite(hex) };
}
