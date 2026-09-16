import sharp from "sharp";
import { STUDIO_STEPS } from "@/lib/analysis/steps";
import { db, type Prisma } from "@/lib/db";
import { makeThumb } from "@/lib/images";
import { notify } from "@/lib/notifications";
import { originalKeyOf } from "@/lib/photos/store";
import { photoKey, storage } from "@/lib/storage";
import type { RenderedBackground } from "@/lib/studio/background";
import { compositeItem, encodeOutput, enhanceOnly, renderCondition, renderDetail, JPEG_QUALITY, type CompositePlan, type RawImage } from "@/lib/studio/compositor";
import { StudioRenderPayloadSchema, type StudioRenderPayload } from "@/lib/studio/job";
import { hasCachedMask, loadCachedMask, storeMask } from "@/lib/studio/mask-cache";
import { STUDIO_MODES, photoKindForMode, type StudioModeId } from "@/lib/studio/modes";
import { mergeOptions, type StudioOptions } from "@/lib/studio/options";
import { RENDER_MAX_EDGE, planAndRenderBackground, prepareSource, scaleMaskTo, type PreparedSource } from "@/lib/studio/pipeline";
import { buildProvenance, xmpPacket, type RenderPath, type StudioProvenance } from "@/lib/studio/provenance";
import { StudioQaFailed, runStudioQa, type QaOutcome } from "@/lib/studio/qa";
import { createRenderAfterSource } from "@/lib/studio/renders";
import { SegmentationFailed, getSegmentationProvider, segmentationStatus, type SegmentationResult } from "@/lib/studio/segmentation";
import { decideStrategy, type RenderStrategy } from "@/lib/studio/strategy";
import type { registerJobHandler } from "../runner";
import { JobRetryableError, type JobContext } from "../types";

/** Long edge of the variant the app displays (full resolution stays in `provenance.originalKey`). */
const WEB_EDGE = 1600;
const THUMB_SIZE = 480;

const STEP = Object.fromEntries(STUDIO_STEPS.map((s) => [s.key, s.label])) as Record<(typeof STUDIO_STEPS)[number]["key"], string>;

type Ctx = JobContext<Record<string, unknown>>;

type LoadedSource = {
  userId: string;
  itemId: string;
  itemTitle: string;
  photoId: string;
  prepared: PreparedSource;
};

type RenderOutcome = {
  raw: RawImage;
  path: RenderPath;
  plan?: CompositePlan;
  background?: RenderedBackground;
  mirrored: boolean;
  colourBalanced: boolean;
  applied?: string[];
  notes: string[];
};

function describeSize(s: { width: number; height: number }) {
  return `${s.width}×${s.height}`;
}

async function loadSource(ctx: Ctx, payload: StudioRenderPayload): Promise<LoadedSource> {
  return ctx.step("load", STEP.load, async (report) => {
    const item = await db.item.findFirst({ where: { id: payload.itemId, ...(ctx.job.userId ? { userId: ctx.job.userId } : {}) }, select: { id: true, userId: true, title: true } });
    if (!item) throw new Error("The item for this render no longer exists");
    const photo = await db.photo.findFirst({ where: { id: payload.photoId, itemId: item.id } });
    if (!photo) throw new Error("The source photo no longer exists");
    if (photo.kind === "STUDIO" || photo.kind === "CONDITION") throw new Error("Studio photos are made from an original photo, not from another render");
    const key = originalKeyOf(photo);
    const bytes = (await storage.get(key)) ?? (await storage.get(photo.storageKey));
    if (!bytes) throw new Error("The source file is no longer in storage");
    const prepared = await prepareSource(bytes, RENDER_MAX_EDGE);
    await report(`Loaded the original at ${describeSize(prepared)}${prepared.width !== photo.width ? " (full resolution)" : ""}`);
    return { userId: item.userId, itemId: item.id, itemTitle: item.title, photoId: photo.id, prepared };
  });
}

/** Segment (or reuse the cached mask). Returns the mask sized to the prepared source, or null on the non-composite paths. */
async function segmentStep(ctx: Ctx, src: LoadedSource, strategy: RenderStrategy, notes: string[]): Promise<{ mask: Buffer | null; segmentation: SegmentationResult | null; maskKey: string | null }> {
  if (strategy.segment === "skip") {
    await ctx.skip("segment", STEP.segment, strategy.segmentReason ?? "Not needed for this mode");
    if (strategy.path === "enhance" && strategy.segmentReason) notes.push(strategy.segmentReason);
    return { mask: null, segmentation: null, maskKey: null };
  }
  return ctx.step("segment", STEP.segment, async (report) => {
    const size = { width: src.prepared.width, height: src.prepared.height };
    if (strategy.segment === "reuse") {
      const cached = await loadCachedMask(src.userId, src.itemId, src.photoId);
      if (cached) {
        const mask = await scaleMaskTo(cached, size);
        await report("Reused the cut-out from the previous render (no new segmentation call)");
        return { mask, segmentation: null, maskKey: null };
      }
      await report("The saved cut-out was missing — separating again");
    }
    const provider = getSegmentationProvider();
    await report(`Sending the photo to ${provider.name} for background separation`);
    let result: SegmentationResult;
    try {
      result = await provider.segment(src.prepared.buffer);
    } catch (err) {
      if (err instanceof SegmentationFailed && err.cause) throw new JobRetryableError(err.message, 15_000);
      throw err;
    }
    const maskKey = await storeMask(src.userId, src.itemId, src.photoId, result.mask);
    await report(`Separated the item (covers ${Math.round(result.coverage * 100)}% of the frame)${result.model ? ` with ${result.model}` : ""}`, { coverage: result.coverage, provider: result.provider });
    return { mask: result.mask, segmentation: result, maskKey };
  });
}

async function renderSteps(ctx: Ctx, src: LoadedSource, mode: StudioModeId, options: StudioOptions, strategy: RenderStrategy, mask: Buffer | null, notes: string[]): Promise<RenderOutcome> {
  const spec = STUDIO_MODES[mode];
  if (strategy.path === "composite" && mask) {
    const stage = await ctx.step("background", STEP.background, async (report) => {
      const s = await planAndRenderBackground(src.prepared.buffer, mask, mode, options, RENDER_MAX_EDGE);
      const kind = s.background.kind.replace("generator:", "generated by ");
      await report(`Rendered a ${kind} background at ${describeSize(s.plan.frame)}${s.background.note ? ` — ${s.background.note}` : ""}`);
      return s;
    });
    if (stage.background.note) notes.push(stage.background.note);
    return ctx.step("composite", STEP.composite, async (report) => {
      const out = await compositeItem(src.prepared.buffer, mask, stage.background, stage.plan, options);
      const scale = stage.plan.placement.scale;
      const parts = [
        `Placed the cut-out${Math.abs(scale - 1) > 1e-6 ? ` at ${Math.round(scale * 100)}% scale` : " at its original size"}`,
        stage.plan.shadow ? `with a ${stage.plan.shadow.type} shadow` : "without a shadow",
        out.colourBalanced ? "and applied the requested colour balance" : "",
      ].filter(Boolean);
      await report(parts.join(" "), { scale });
      return { raw: out.raw, path: "composite", plan: stage.plan, background: stage.background, mirrored: stage.plan.mirrored, colourBalanced: out.colourBalanced, notes };
    });
  }

  const keepReason = strategy.path === "enhance" ? "The original background is kept — enhancement only" : `${spec.name} photos keep the original background`;
  await ctx.skip("background", STEP.background, keepReason);

  if (strategy.path === "condition") {
    return ctx.step("composite", "Cropping to the defect and drawing the ring", async (report) => {
      const r = await renderCondition(src.prepared.buffer, options, { maxEdge: RENDER_MAX_EDGE });
      await report(`Cropped ${describeSize(r.crop)} around the focus point${options.label ? ` and labelled it “${options.label}”` : ""}; nothing removed or smoothed`);
      return { raw: r.raw, path: "condition", mirrored: r.mirrored, colourBalanced: r.colourBalanced, notes };
    });
  }
  if (strategy.path === "detail") {
    return ctx.step("composite", "Cropping to the detail at 2×", async (report) => {
      const r = await renderDetail(src.prepared.buffer, options, { maxEdge: RENDER_MAX_EDGE });
      await report(`Cropped ${describeSize(r.crop)} at 2× with light sharpening (pixels resampled)`);
      return { raw: r.raw, path: "detail", mirrored: r.mirrored, colourBalanced: r.colourBalanced, notes };
    });
  }
  return ctx.step("composite", "Enhancing the original photo", async (report) => {
    const r = await enhanceOnly(src.prepared.buffer, options, { maxEdge: RENDER_MAX_EDGE });
    await report(`Applied ${r.applied.join(", ")}; no pixels were synthesised`);
    return { raw: r.raw, path: "enhance", mirrored: r.mirrored, colourBalanced: r.colourBalanced, applied: r.applied, notes };
  });
}

async function qaStep(ctx: Ctx, src: LoadedSource, mode: StudioModeId, strategy: RenderStrategy, jpeg: Buffer): Promise<StudioProvenance["qa"]> {
  if (!strategy.qa) {
    await ctx.skip("qa", STEP.qa, strategy.qaSkipReason ?? "Nothing was replaced");
    return { status: "skipped", reason: strategy.qaSkipReason ?? "Nothing was replaced" };
  }
  return ctx.step("qa", STEP.qa, async (report) => {
    let outcome: QaOutcome;
    try {
      outcome = await runStudioQa(src.prepared.buffer, jpeg, mode);
    } catch (err) {
      if (err instanceof StudioQaFailed) throw new Error(`Discarded — the check found a difference: ${err.outcome.reason}`);
      throw err;
    }
    await report(outcome.status === "pass" ? `Passed: ${outcome.reason}` : outcome.reason, { status: outcome.status, provider: outcome.provider });
    return { status: outcome.status, reason: outcome.reason, provider: outcome.provider };
  });
}

export function register(r: typeof registerJobHandler) {
  r("STUDIO_RENDER", async (ctx) => {
    const parsed = StudioRenderPayloadSchema.safeParse(ctx.payload);
    if (!parsed.success) throw new Error(`Invalid STUDIO_RENDER payload: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    const payload = parsed.data;
    const mode = payload.mode;
    const spec = STUDIO_MODES[mode];
    const options = mergeOptions(spec.defaults, payload.options);
    const notes: string[] = [];

    const src = await loadSource(ctx, payload);

    const seg = segmentationStatus();
    const cached = spec.needsSegmentation ? await hasCachedMask(src.userId, src.itemId, src.photoId) : false;
    const strategy = decideStrategy(mode, { segmentationAvailable: seg.available, hasCachedMask: cached, unavailableReason: seg.reason });

    const segmented = await segmentStep(ctx, src, strategy, notes);
    const rendered = await renderSteps(ctx, src, mode, options, strategy, segmented.mask, notes);

    // Encode once so QA judges exactly the bytes we would save.
    const preliminary = buildProvenance({
      mode,
      path: rendered.path,
      sourcePhotoId: src.photoId,
      options,
      segmentationProvider: strategy.path === "composite" ? (segmented.segmentation?.provider ?? seg.provider) : null,
      generatorProvider: rendered.background?.kind.startsWith("generator:") ? rendered.background.kind.slice("generator:".length) : null,
      model: segmented.segmentation?.model ?? rendered.background?.model,
      scale: rendered.plan?.placement.scale,
      mirrored: rendered.mirrored,
      colourBalanced: rendered.colourBalanced,
      background: rendered.background ? { kind: rendered.background.kind, note: rendered.background.note } : undefined,
      notes,
    });
    const xmp = xmpPacket(preliminary);
    const wantPng = rendered.background?.isPureWhite ?? false;
    const encoded = await encodeOutput(rendered.raw, { xmp, png: wantPng, quality: JPEG_QUALITY });

    const qa = await qaStep(ctx, src, mode, strategy, encoded.jpeg);

    const created = await ctx.step("save", STEP.save, async (report) => {
      const photoId = crypto.randomUUID();
      const fullKey = photoKey(src.userId, src.itemId, photoId, "studio");
      const webKey = photoKey(src.userId, src.itemId, photoId, "web");
      const thumbKey = photoKey(src.userId, src.itemId, photoId, "thumb");
      const pngKey = encoded.png ? photoKey(src.userId, src.itemId, photoId, "studio", "png") : undefined;

      const web = await sharp(encoded.jpeg).resize({ width: WEB_EDGE, height: WEB_EDGE, fit: "inside", withoutEnlargement: true }).withXmp(xmp).jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      const thumb = await makeThumb(encoded.jpeg, THUMB_SIZE);
      const immutable = "private, max-age=31536000, immutable";
      await Promise.all([
        storage.put(fullKey, encoded.jpeg, { contentType: "image/jpeg", cacheControl: immutable }),
        storage.put(webKey, web.data, { contentType: "image/jpeg", cacheControl: immutable }),
        storage.put(thumbKey, thumb.buffer, { contentType: "image/jpeg", cacheControl: immutable }),
        ...(encoded.png && pngKey ? [storage.put(pngKey, encoded.png, { contentType: "image/png", cacheControl: immutable })] : []),
      ]);

      const provenance: StudioProvenance = { ...preliminary, qa, outputs: { pngKey, maskKey: segmented.maskKey ?? undefined, xmp: true }, originalKey: fullKey };
      const label = mode === "CONDITION" ? options.label.trim() || "Condition detail" : spec.name;
      try {
        const photo = await createRenderAfterSource({
          itemId: src.itemId,
          sourceId: src.photoId,
          data: {
            id: photoId,
            kind: photoKindForMode(mode),
            storageKey: webKey,
            thumbKey,
            mimeType: "image/jpeg",
            width: web.info.width,
            height: web.info.height,
            bytes: web.data.length,
            aiGenerated: provenance.aiGenerated,
            studioMode: mode,
            label,
            provenance: provenance as unknown as Prisma.InputJsonValue,
          },
        });
        await report(`Saved ${describeSize(encoded)} JPEG${encoded.png ? " + PNG" : ""} as “${label}” (${provenance.label})`, { photoId: photo.id, label: provenance.label, aiGenerated: provenance.aiGenerated });
        return photo;
      } catch (err) {
        await Promise.allSettled([fullKey, webKey, thumbKey, pngKey].filter((k): k is string => !!k).map((k) => storage.delete(k)));
        throw err;
      }
    });

    if (payload.initiatedBy === "user") {
      await notify(src.userId, {
        type: "studio.ready",
        title: "Studio photo ready",
        body: `${spec.name} version of ${src.itemTitle} is ready to review.`,
        href: `/items/${src.itemId}/studio?render=${created.id}`,
      });
    }
    return { photoId: created.id };
  });
}
