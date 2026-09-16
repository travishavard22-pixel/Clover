import sharp from "sharp";

/**
 * Synthetic test images. The "item" is a rectangle filled with a deterministic per-pixel pattern
 * so that any resampling, smoothing or colour shift is detectable byte for byte.
 */
export type Rect = { left: number; top: number; width: number; height: number };

export const SRC = { width: 400, height: 300 };
export const ITEM: Rect = { left: 60, top: 60, width: 280, height: 180 };
export const BG = { r: 40, g: 160, b: 90 };

export function patternPixel(x: number, y: number): [number, number, number] {
  return [(x * 7 + y * 3) % 256, (x * 2 + y * 11) % 256, (x * 5 + y * 13 + 128) % 256];
}

export function makeSourceRaw(size = SRC, item = ITEM, bg = BG): Buffer {
  const data = Buffer.alloc(size.width * size.height * 3);
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const i = (y * size.width + x) * 3;
      const inside = x >= item.left && x < item.left + item.width && y >= item.top && y < item.top + item.height;
      const [r, g, b] = inside ? patternPixel(x, y) : [bg.r, bg.g, bg.b];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return data;
}

export async function makeSourcePng(size = SRC, item = ITEM, bg = BG): Promise<Buffer> {
  return sharp(makeSourceRaw(size, item, bg), { raw: { width: size.width, height: size.height, channels: 3 } }).png().toBuffer();
}

export async function makeMaskPng(size = SRC, item = ITEM): Promise<Buffer> {
  const data = Buffer.alloc(size.width * size.height, 0);
  for (let y = item.top; y < item.top + item.height; y++) for (let x = item.left; x < item.left + item.width; x++) data[y * size.width + x] = 255;
  return sharp(data, { raw: { width: size.width, height: size.height, channels: 1 } }).png().toBuffer();
}

/** RGBA cut-out the way a provider would return it: item pixels with alpha 255, everything else transparent. */
export async function makeCutoutPng(size = SRC, item = ITEM): Promise<Buffer> {
  const rgb = makeSourceRaw(size, item);
  const data = Buffer.alloc(size.width * size.height * 4, 0);
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const inside = x >= item.left && x < item.left + item.width && y >= item.top && y < item.top + item.height;
      const i = y * size.width + x;
      data[i * 4] = rgb[i * 3]!;
      data[i * 4 + 1] = rgb[i * 3 + 1]!;
      data[i * 4 + 2] = rgb[i * 3 + 2]!;
      data[i * 4 + 3] = inside ? 255 : 0;
    }
  }
  return sharp(data, { raw: { width: size.width, height: size.height, channels: 4 } }).png().toBuffer();
}

export function pixelAt(raw: { data: Buffer; width: number }, x: number, y: number): [number, number, number] {
  const i = (y * raw.width + x) * 3;
  return [raw.data[i]!, raw.data[i + 1]!, raw.data[i + 2]!];
}

export function isJpeg(buf: Buffer) {
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export function isPng(buf: Buffer) {
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
