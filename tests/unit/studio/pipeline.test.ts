import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { STUDIO_MODES } from "@/lib/studio/modes";
import { PREVIEW_MAX_EDGE, prepareSource, renderQuick, scaleMaskTo, toJpegDataUrl } from "@/lib/studio/pipeline";
import { makeMaskPng, makeSourcePng } from "./fixtures";

describe("studio pipeline", () => {
  it("prepares a source: capped long edge, no alpha, PNG", async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 4, background: "#ffffff80" } }).png().toBuffer();
    const p = await prepareSource(big, 1024);
    expect([p.width, p.height]).toEqual([1024, 683]);
    const meta = await sharp(p.buffer).metadata();
    expect(meta.channels).toBe(3);
    expect(meta.format).toBe("png");
  });

  it("scales a cached mask to a new source size", async () => {
    const m = await scaleMaskTo(await makeMaskPng(), { width: 200, height: 150 });
    const meta = await sharp(m).metadata();
    expect([meta.width, meta.height, meta.channels]).toEqual([200, 150, 1]);
  });

  it("renderQuick takes the enhance path without a mask and labels it", async () => {
    const r = await renderQuick({ source: await makeSourcePng(), mode: "CLEAN_STUDIO", options: STUDIO_MODES.CLEAN_STUDIO.defaults, mask: null, maxEdge: 320, unavailableReason: "No provider configured" });
    expect(r.path).toBe("enhance");
    expect(r.label).toBe("Enhancement only");
    expect(r.notes).toContain("No provider configured");
    expect(Math.max(r.raw.width, r.raw.height)).toBeLessThanOrEqual(320);
    expect(r.applied).toContain("levels");
  });

  it("renderQuick composites when a mask is available", async () => {
    const r = await renderQuick({ source: await makeSourcePng(), mode: "ECOMMERCE", options: STUDIO_MODES.ECOMMERCE.defaults, mask: await makeMaskPng(), maxEdge: 320 });
    expect(r.path).toBe("composite");
    expect(r.label).toBe("AI background");
    expect(r.raw.width).toBe(r.raw.height); // 1:1
    expect(r.background?.kind).toBe("solid");
    expect(r.scale).toBeGreaterThan(0);
  });

  it("renderQuick crops for DETAIL and CONDITION regardless of mask", async () => {
    const d = await renderQuick({ source: await makeSourcePng(), mode: "DETAIL", options: STUDIO_MODES.DETAIL.defaults, mask: await makeMaskPng(), maxEdge: PREVIEW_MAX_EDGE });
    expect(d.path).toBe("detail");
    const c = await renderQuick({ source: await makeSourcePng(), mode: "CONDITION", options: { ...STUDIO_MODES.CONDITION.defaults, label: "Dent" }, maxEdge: PREVIEW_MAX_EDGE });
    expect(c.path).toBe("condition");
    expect(c.label).toBe("Condition");
  });

  it("encodes a JPEG data URL", async () => {
    const r = await renderQuick({ source: await makeSourcePng(), mode: "CONDITION", options: STUDIO_MODES.CONDITION.defaults, maxEdge: 200 });
    const url = await toJpegDataUrl(r.raw);
    expect(url.startsWith("data:image/jpeg;base64,/9j/")).toBe(true);
  });
});
