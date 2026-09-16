import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { gradientSvg, renderBackgroundForMode, renderBlurredOriginal, renderGradient, renderSolid, renderStudioSweep } from "@/lib/studio/background";
import { dominantColourMasked } from "@/lib/studio/background/dominant";
import { getBackgroundGenerator } from "@/lib/studio/background/generator";
import { boldComplement, contrastingText, hexToRgb, luminance, rgbToHex } from "@/lib/studio/color";
import { STUDIO_MODES } from "@/lib/studio/modes";
import { makeMaskPng, makeSourcePng } from "./fixtures";

const size = { width: 120, height: 90 };

describe("background renderers", () => {
  it("solid: exact colour, flags pure white", async () => {
    const white = await renderSolid(size, "#FFFFFF");
    expect(white.isPureWhite).toBe(true);
    const paper = await renderSolid(size, "#F8F7F3");
    expect(paper.isPureWhite).toBe(false);
    const { data, info } = await sharp(paper.image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 120, height: 90, channels: 3 });
    expect([data[0], data[1], data[2]]).toEqual([0xf8, 0xf7, 0xf3]);
  });

  it("gradient: SVG with stops and optional vignette, rendered at size", async () => {
    const svg = gradientSvg(size, { kind: "linear", angle: 90, stops: [{ offset: 0, color: "#FFFFFF" }, { offset: 1, color: "#000000" }], vignette: 0.2 });
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('<stop offset="100%" stop-color="#000000"/>');
    expect(svg).toContain('id="v"');
    const g = await renderGradient(size, { kind: "radial", stops: [{ offset: 0, color: "#333333" }, { offset: 1, color: "#000000" }] });
    const meta = await sharp(g.image).metadata();
    expect(meta.width).toBe(120);
    const { data } = await sharp(g.image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const centre = data[(45 * 120 + 60) * 3]!;
    const corner = data[0]!;
    expect(centre).toBeGreaterThan(corner);
  });

  it("studio sweep: the floor is darker than the wall", async () => {
    const s = await renderStudioSweep(size, "#F8F7F3", { depth: 0.1, vignette: 0 });
    const { data } = await sharp(s.image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const top = data[(2 * 120 + 60) * 3]!;
    const bottom = data[(87 * 120 + 60) * 3]!;
    expect(bottom).toBeLessThan(top);
    expect(s.kind).toBe("studio-sweep");
  });

  it("blurred original: covers the frame and says no generator is configured", async () => {
    const b = await renderBlurredOriginal(await makeSourcePng(), size);
    expect(b.note).toBe("Soft background (no generator configured)");
    const meta = await sharp(b.image).metadata();
    expect([meta.width, meta.height]).toEqual([120, 90]);
  });

  it("no generator is wired, so LIFESTYLE auto falls back to the blurred original", async () => {
    expect(getBackgroundGenerator()).toBeNull();
    const src = await makeSourcePng();
    const bg = await renderBackgroundForMode("LIFESTYLE", STUDIO_MODES.LIFESTYLE.defaults, size, { source: src, mask: await makeMaskPng() });
    expect(bg.kind).toBe("blurred-original");
    expect(bg.note).toMatch(/no generator/);
  });

  it("picks the right renderer per mode", async () => {
    const src = await makeSourcePng();
    expect((await renderBackgroundForMode("ECOMMERCE", STUDIO_MODES.ECOMMERCE.defaults, size, { source: src })).isPureWhite).toBe(true);
    expect((await renderBackgroundForMode("CLEAN_STUDIO", STUDIO_MODES.CLEAN_STUDIO.defaults, size, { source: src })).kind).toBe("studio-sweep");
    expect((await renderBackgroundForMode("LUXURY", STUDIO_MODES.LUXURY.defaults, size, { source: src })).kind).toBe("gradient");
    expect((await renderBackgroundForMode("MARKETPLACE", STUDIO_MODES.MARKETPLACE.defaults, size, { source: src })).kind).toBe("gradient");
    const social = await renderBackgroundForMode("SOCIAL", STUDIO_MODES.SOCIAL.defaults, size, { source: src, itemDominant: { r: 200, g: 40, b: 40 } });
    const { data } = await sharp(social.image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // Complement of red is a teal/cyan: blue and green dominate.
    expect(data[2]!).toBeGreaterThan(data[0]!);
  });
});

describe("colour helpers", () => {
  it("converts hex and computes luminance / contrasting text", () => {
    expect(hexToRgb("#1E7A4C")).toEqual({ r: 30, g: 122, b: 76 });
    expect(rgbToHex({ r: 30, g: 122, b: 76 })).toBe("#1E7A4C");
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1);
    expect(contrastingText({ r: 20, g: 20, b: 20 })).toBe("#FFFFFF");
    expect(contrastingText({ r: 240, g: 240, b: 240 })).toBe("#141613");
    expect(() => hexToRgb("#FFF")).toThrow();
  });

  it("bold complement flips the hue and never returns mud for greys", () => {
    const c = boldComplement({ r: 200, g: 40, b: 40 });
    expect(c.b).toBeGreaterThan(c.r);
    const grey = boldComplement({ r: 128, g: 128, b: 128 });
    expect(grey.b).toBeGreaterThan(grey.r);
  });

  it("masked dominant colour ignores the background", async () => {
    const d = await dominantColourMasked(await makeSourcePng(), await makeMaskPng());
    // The item pattern is not the flat green background.
    expect(d).not.toEqual({ r: 40, g: 160, b: 90 });
  });
});
