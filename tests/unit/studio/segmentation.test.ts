import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MAX_COVERAGE, MIN_COVERAGE, assertUsableCoverage, coverageOfMask, cutoutFromMask, finalizeSegmentation, maskFromCutout } from "@/lib/studio/segmentation/mask";
import { NoSegmentation } from "@/lib/studio/segmentation/none";
import { PHOTOROOM_SEGMENT_URL, PhotoroomSegmentation } from "@/lib/studio/segmentation/photoroom";
import { REMOVEBG_URL, RemoveBgSegmentation } from "@/lib/studio/segmentation/removebg";
import { RunpodSegmentation, runpodRunSyncUrl } from "@/lib/studio/segmentation/runpod";
import { COVERAGE_MESSAGE, SegmentationFailed, SegmentationUnavailable } from "@/lib/studio/segmentation/types";
import { ITEM, SRC, makeCutoutPng, makeMaskPng, makeSourcePng, patternPixel } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("mask helpers", () => {
  it("derives a mask from a cut-out's alpha and a cut-out from a mask, copying source pixels", async () => {
    const mask = await maskFromCutout(await makeCutoutPng());
    const meta = await sharp(mask).metadata();
    expect(meta.channels).toBe(1);
    expect(await coverageOfMask(mask)).toBeCloseTo((ITEM.width * ITEM.height) / (SRC.width * SRC.height), 3);
    const cutout = await cutoutFromMask(await makeSourcePng(), mask);
    const { data, info } = await sharp(cutout).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4));
    expect(px(ITEM.left + 10, ITEM.top + 10)).toEqual([...patternPixel(ITEM.left + 10, ITEM.top + 10), 255]);
    expect(px(2, 2)[3]).toBe(0);
  });

  it("rejects masks that cover almost nothing or almost everything with a friendly message", () => {
    expect(() => assertUsableCoverage(MIN_COVERAGE - 0.01)).toThrow(SegmentationFailed);
    expect(() => assertUsableCoverage(MAX_COVERAGE + 0.01)).toThrow(COVERAGE_MESSAGE);
    expect(() => assertUsableCoverage(0.42)).not.toThrow();
  });

  it("finalizes a provider result at the source size and rebuilds the cut-out from our pixels", async () => {
    const source = await makeSourcePng();
    const half = await sharp(await makeMaskPng()).resize(200, 150).png().toBuffer();
    const r = await finalizeSegmentation(source, { mask: half }, "runpod", "birefnet");
    const meta = await sharp(r.mask).metadata();
    expect(meta.width).toBe(SRC.width);
    expect(meta.height).toBe(SRC.height);
    expect(r.provider).toBe("runpod");
    expect(r.model).toBe("birefnet");
    expect(r.coverage).toBeGreaterThan(0.4);
    await expect(finalizeSegmentation(source, {}, "x")).rejects.toThrow(/neither a cut-out nor a mask/);
    const tiny = await makeMaskPng(SRC, { left: 0, top: 0, width: 10, height: 10 });
    await expect(finalizeSegmentation(source, { mask: tiny }, "x")).rejects.toThrow(COVERAGE_MESSAGE);
  });
});

describe("providers", () => {
  it("`none` throws SegmentationUnavailable with the configured reason", async () => {
    await expect(new NoSegmentation("Demo mode").segment()).rejects.toBeInstanceOf(SegmentationUnavailable);
    await expect(new NoSegmentation("Demo mode").segment()).rejects.toThrow("Demo mode");
  });

  it("Photoroom: multipart image_file + x-api-key, PNG cut-out back", async () => {
    const cutout = await makeCutoutPng();
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(PHOTOROOM_SEGMENT_URL);
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("pr-key");
      const fd = init.body as FormData;
      expect(fd.get("image_file")).toBeInstanceOf(Blob);
      return new Response(new Uint8Array(cutout), { status: 200, headers: { "Content-Type": "image/png" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await new PhotoroomSegmentation("pr-key").segment(await makeSourcePng());
    expect(r.provider).toBe("photoroom");
    expect(r.coverage).toBeCloseTo(0.42, 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("remove.bg: image_file + size=auto + X-Api-Key; HTTP errors become SegmentationFailed", async () => {
    const cutout = await makeCutoutPng();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(REMOVEBG_URL);
        expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("rb-key");
        expect((init.body as FormData).get("size")).toBe("auto");
        return new Response(new Uint8Array(cutout), { status: 200 });
      }),
    );
    const r = await new RemoveBgSegmentation("rb-key").segment(await makeSourcePng());
    expect(r.provider).toBe("removebg");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 402 })));
    await expect(new RemoveBgSegmentation("rb-key").segment(await makeSourcePng())).rejects.toThrow(/HTTP 402/);
  });

  it("Runpod: runsync with { input: { image_base64 } } and Bearer auth; reads output.mask_base64", async () => {
    const mask = await makeMaskPng();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(runpodRunSyncUrl("ep123"));
        expect(url).toBe("https://api.runpod.ai/v2/ep123/runsync");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rp-key");
        const body = JSON.parse(init.body as string) as { input: { image_base64: string } };
        expect(typeof body.input.image_base64).toBe("string");
        return Response.json({ id: "j", status: "COMPLETED", output: { mask_base64: mask.toString("base64"), model: "birefnet-general" } });
      }),
    );
    const r = await new RunpodSegmentation("rp-key", "ep123").segment(await makeSourcePng());
    expect(r.provider).toBe("runpod");
    expect(r.model).toBe("birefnet-general");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "FAILED", error: "OOM" })));
    await expect(new RunpodSegmentation("rp-key", "ep123").segment(await makeSourcePng())).rejects.toThrow(/status FAILED: OOM/);
  });

  it("network failures carry a cause so the job can retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("ECONNRESET"); }));
    const err = await new PhotoroomSegmentation("k").segment(await makeSourcePng()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SegmentationFailed);
    expect((err as SegmentationFailed).cause).toBeInstanceOf(TypeError);
  });
});
