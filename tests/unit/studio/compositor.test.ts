import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderSolid } from "@/lib/studio/background";
import { applyColourBalance, compositeItem, conditionOverlaySvg, encodeOutput, enhanceOnly, planComposite, renderCondition, renderDetail } from "@/lib/studio/compositor";
import { NEUTRAL_OPTIONS, type StudioOptions } from "@/lib/studio/options";
import { STUDIO_ACCENT_HEX } from "@/lib/studio/palette";
import { SegmentationFailed } from "@/lib/studio/segmentation/types";
import { BG, ITEM, SRC, isJpeg, isPng, makeMaskPng, makeSourcePng, makeSourceRaw, patternPixel, pixelAt } from "./fixtures";

const noShadow: StudioOptions = { ...NEUTRAL_OPTIONS, background: "#F8F7F3", crop: { aspect: "original", padding: 20 }, shadow: { type: "none", opacity: 0, offset: 0 } };

describe("compositor geometry", () => {
  it("plans the frame, bounding box and placement from the mask", async () => {
    const plan = await planComposite(await makeSourcePng(), await makeMaskPng(), noShadow);
    expect(plan.source).toEqual(SRC);
    expect(plan.frame).toEqual({ width: 400, height: 300 });
    expect(plan.itemBox).toEqual(ITEM);
    expect(plan.placement).toEqual({ scale: 1, left: 60, top: 60, width: 280, height: 180 });
    expect(plan.shadow).toBeNull();
    expect(plan.mirrored).toBe(false);
  });

  it("mirrors the bounding box when flipping and squares the frame for 1:1", async () => {
    const plan = await planComposite(await makeSourcePng(), await makeMaskPng(), { ...noShadow, flipHorizontal: true, crop: { aspect: "1:1", padding: 0 } });
    expect(plan.frame).toEqual({ width: 400, height: 400 });
    expect(plan.itemBox.left).toBe(SRC.width - ITEM.left - ITEM.width);
    expect(plan.mirrored).toBe(true);
    expect(plan.placement.scale).toBeCloseTo(400 / 280);
  });

  it("rejects an empty or mismatched mask with a user-facing error", async () => {
    const empty = await sharp({ create: { width: SRC.width, height: SRC.height, channels: 3, background: { r: 0, g: 0, b: 0 } } }).toColourspace("b-w").png().toBuffer();
    await expect(planComposite(await makeSourcePng(), empty, noShadow)).rejects.toBeInstanceOf(SegmentationFailed);
    const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 255, b: 255 } } }).toColourspace("b-w").png().toBuffer();
    await expect(planComposite(await makeSourcePng(), small, noShadow)).rejects.toThrow(/sizes differ/);
  });
});

describe("compositor identity rule", () => {
  it("copies item pixels byte for byte at scale 1 and paints the background elsewhere", async () => {
    const source = await makeSourcePng();
    const mask = await makeMaskPng();
    const plan = await planComposite(source, mask, noShadow);
    const bg = await renderSolid(plan.frame, "#F8F7F3");
    const out = await compositeItem(source, mask, bg, plan, noShadow);
    expect(out.raw.width).toBe(400);
    expect(out.raw.height).toBe(300);
    expect(out.colourBalanced).toBe(false);
    const src = { data: makeSourceRaw(), width: SRC.width };
    for (const [x, y] of [
      [ITEM.left, ITEM.top],
      [ITEM.left + 137, ITEM.top + 91],
      [ITEM.left + ITEM.width - 1, ITEM.top + ITEM.height - 1],
    ] as const) {
      expect(pixelAt(out.raw, x, y)).toEqual(pixelAt(src, x, y));
      expect(pixelAt(out.raw, x, y)).toEqual(patternPixel(x, y));
    }
    // Outside the item the original green background is gone; the paper background is there instead.
    expect(pixelAt(out.raw, 5, 5)).toEqual([0xf8, 0xf7, 0xf3]);
    expect(pixelAt(out.raw, 5, 5)).not.toEqual([BG.r, BG.g, BG.b]);
  });

  it("draws a contact shadow under the item without touching item pixels", async () => {
    const source = await makeSourcePng();
    const mask = await makeMaskPng();
    const opts: StudioOptions = { ...noShadow, shadow: { type: "contact", opacity: 0.6, offset: 4 } };
    const plan = await planComposite(source, mask, opts);
    expect(plan.shadow?.type).toBe("contact");
    const bg = await renderSolid(plan.frame, "#F8F7F3");
    const out = await compositeItem(source, mask, bg, plan, opts);
    const { placement } = plan;
    const below = pixelAt(out.raw, placement.left + Math.round(placement.width / 2), Math.min(299, placement.top + placement.height + 3));
    expect(below[0]).toBeLessThan(0xf8);
    const farCorner = pixelAt(out.raw, 2, 2);
    expect(farCorner).toEqual([0xf8, 0xf7, 0xf3]);
    const centre = pixelAt(out.raw, placement.left + 10, placement.top + 10);
    const srcCentre = patternPixel(ITEM.left + 10, ITEM.top + 10);
    expect(centre).toEqual(srcCentre);
  });

  it("applies colour balance to the whole composite only when requested", async () => {
    const source = await makeSourcePng();
    const mask = await makeMaskPng();
    const opts: StudioOptions = { ...noShadow, colorBalance: { temperature: 100, exposure: 0 } };
    const plan = await planComposite(source, mask, opts);
    const bg = await renderSolid(plan.frame, "#808080");
    const out = await compositeItem(source, mask, bg, plan, opts);
    expect(out.colourBalanced).toBe(true);
    const corner = pixelAt(out.raw, 2, 2);
    expect(corner[0]).toBeGreaterThan(corner[2]); // warmer: red gain up, blue gain down
    const direct = await applyColourBalance({ data: Buffer.from([128, 128, 128]), width: 1, height: 1, channels: 3 }, { ...NEUTRAL_OPTIONS, colorBalance: { temperature: 0, exposure: 1 } });
    expect(direct.data[0]).toBe(255); // +1 EV doubles and clips
  });
});

describe("encoding", () => {
  it("writes JPEG at quality 92 with the XMP packet, and PNG on request", async () => {
    const raw = { data: makeSourceRaw(), width: SRC.width, height: SRC.height, channels: 3 as const };
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><Iptc4xmpExt:DigitalSourceType>test</Iptc4xmpExt:DigitalSourceType></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    const out = await encodeOutput(raw, { xmp, png: true });
    expect(isJpeg(out.jpeg)).toBe(true);
    expect(isPng(out.png!)).toBe(true);
    const meta = await sharp(out.jpeg).metadata();
    expect(meta.width).toBe(400);
    expect(Buffer.from(meta.xmp ?? "").toString()).toContain("DigitalSourceType");
    const pngMeta = await sharp(out.png!).metadata();
    expect(pngMeta.format).toBe("png");
    const plain = await encodeOutput(raw);
    expect(plain.png).toBeUndefined();
  });
});

describe("enhance-only path", () => {
  it("produces a valid JPEG of the same size, records what it did and synthesises nothing", async () => {
    const src = await makeSourcePng();
    const r = await enhanceOnly(src, NEUTRAL_OPTIONS);
    expect(r.applied).toEqual(["levels", "white balance", "padded 8%"]);
    expect(r.colourBalanced).toBe(false);
    expect(r.mirrored).toBe(false);
    expect(r.raw.width).toBe(400);
    expect(r.raw.height).toBe(300);
    const enc = await encodeOutput(r.raw);
    expect(isJpeg(enc.jpeg)).toBe(true);
    const meta = await sharp(enc.jpeg).metadata();
    expect(meta).toMatchObject({ width: 400, height: 300, format: "jpeg" });
  });

  it("extends to a requested aspect with the photo's own edge colour instead of cropping", async () => {
    const src = await makeSourcePng();
    const r = await enhanceOnly(src, { ...NEUTRAL_OPTIONS, crop: { aspect: "1:1", padding: 0 } });
    expect(r.raw.width).toBe(400);
    expect(r.raw.height).toBe(400);
    expect(r.applied).toContain("extended to 1:1 with edge colour");
    const top = pixelAt(r.raw, 200, 2);
    // Extension band uses the (green) edge colour, so green dominates.
    expect(top[1]).toBeGreaterThan(top[0]);
    expect(top[1]).toBeGreaterThan(top[2]);
  });

  it("mirrors and colour-balances only when asked", async () => {
    const src = await makeSourcePng();
    const r = await enhanceOnly(src, { ...NEUTRAL_OPTIONS, flipHorizontal: true, crop: { aspect: "original", padding: 0 }, colorBalance: { temperature: -50, exposure: 0 } });
    expect(r.applied).toEqual(["mirrored", "levels", "white balance", "colour balance (user)"]);
    expect(r.mirrored).toBe(true);
    expect(r.colourBalanced).toBe(true);
  });
});

describe("crop modes", () => {
  it("DETAIL crops 2× around the focus point and enlarges", async () => {
    const src = await makeSourcePng();
    const r = await renderDetail(src, { ...NEUTRAL_OPTIONS, focus: { x: 0.5, y: 0.5 } }, { maxEdge: 2048 });
    expect(r.crop).toEqual({ left: 100, top: 75, width: 200, height: 150 });
    expect(r.raw.width).toBe(400);
    expect(r.raw.height).toBe(300);
  });

  it("CONDITION keeps the background, crops to the defect and draws the ring and label", async () => {
    const src = await makeSourcePng();
    const r = await renderCondition(src, { ...NEUTRAL_OPTIONS, focus: { x: 0.5, y: 0.5 }, label: "Scratch" }, { maxEdge: 2048 });
    expect(r.ring).toBeDefined();
    expect(r.raw.width).toBe(r.crop.width);
    expect(r.raw.height).toBe(r.crop.height);
    // Background (green) survives inside the crop, outside the item rectangle.
    const bgX = ITEM.left - r.crop.left - 5;
    expect(bgX).toBeGreaterThanOrEqual(0);
    expect(pixelAt(r.raw, bgX, 5)).toEqual([BG.r, BG.g, BG.b]);
    // The ring is drawn in the accent colour somewhere on its circumference.
    const { cx, cy, r: rad } = r.ring!;
    const accent = [0x1e, 0x7a, 0x4c];
    let hit = false;
    for (let dx = -3; dx <= 3 && !hit; dx++) {
      const p = pixelAt(r.raw, cx + rad + dx, cy);
      hit = Math.abs(p[0] - accent[0]!) < 24 && Math.abs(p[1] - accent[1]!) < 24 && Math.abs(p[2] - accent[2]!) < 24;
    }
    expect(hit).toBe(true);
    const svg = conditionOverlaySvg({ width: 400, height: 300 }, { cx: 200, cy: 150, r: 40 }, "Scratch <b>");
    expect(svg).toContain(`stroke="${STUDIO_ACCENT_HEX}"`);
    expect(svg).toContain("Scratch &lt;b&gt;");
    expect(conditionOverlaySvg({ width: 400, height: 300 }, { cx: 200, cy: 150, r: 40 }, "")).not.toContain("<text");
  });
});
