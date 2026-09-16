import { getAiProvider } from "../../ai";
import { AiRefusalError, AiUnavailableError } from "../../ai/anthropic";
import type { IdentifyInput, IdentifyOutput } from "../../ai/provider";
import type { ItemProfile } from "../../ai/schemas";
import { loadVisionPhotos } from "../../ai/vision-input";
import { ANALYZE_STEPS, STUDIO_STEPS } from "../../analysis/steps";
import { audit } from "../../audit";
import { db, Prisma, type Item, type Photo } from "../../db";
import { capabilities, env } from "../../env";
import { generateListingDrafts } from "../../listings/generate";
import { MARKETPLACES } from "../../marketplaces/registry";
import { formatMoney } from "../../money";
import { notify } from "../../notifications";
import { visiblePhotos } from "../../photos/order";
import { listPhotos } from "../../photos/store";
import { conditionNotesFrom, describeGrading } from "../../pricing/condition";
import { recomputeEstimate, refreshComps } from "../../pricing/service";
import { enqueueJob } from "../queue";
import type { registerJobHandler } from "../runner";
import { JobRetryableError, type JobContext } from "../types";

/**
 * ANALYZE_ITEM — the plan in `src/lib/analysis/steps.ts`, one `ctx.step` per key, each with a
 * truthful status line. Photos and previously saved data are never deleted; a failure returns the
 * item to DRAFT with the error on the job.
 */

export type AnalyzePayload = { itemId: string };

const ESCALATION_THRESHOLD = 0.7;
const FIELD_CONFIDENCE = 0.6;
const RETRY_DELAY_MS = 15_000;

export function register(r: typeof registerJobHandler) {
  r<AnalyzePayload, AnalyzeResult>("ANALYZE_ITEM", analyzeItem);
}

export type AnalyzeResult = { itemId: string; itemName: string; identityTier: ItemProfile["identityTier"]; recommendedCents: number | null; drafts: number };

const labelOf = (key: (typeof ANALYZE_STEPS)[number]["key"]) => ANALYZE_STEPS.find((s) => s.key === key)!.label;

export async function analyzeItem(ctx: JobContext<AnalyzePayload>): Promise<AnalyzeResult> {
  const itemId = ctx.payload.itemId ?? ctx.job.itemId;
  if (!itemId) throw new Error("ANALYZE_ITEM needs an itemId");
  const item = await db.item.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Item no longer exists");
  const userId = ctx.job.userId ?? item.userId;
  if (item.status !== "ANALYZING") await db.item.update({ where: { id: itemId }, data: { status: "ANALYZING" } });

  try {
    return await runPipeline(ctx, item, userId);
  } catch (err) {
    await handleFailure(ctx, itemId, err);
    throw err; // unreachable: handleFailure always throws
  }
}

async function runPipeline(ctx: JobContext<AnalyzePayload>, item: Item, userId: string): Promise<AnalyzeResult> {
  const ai = await getAiProvider();
  const prefs = await db.userPreferences.findUnique({ where: { userId } });

  // ── prepare ──
  const { images, photos } = await ctx.step("prepare", labelOf("prepare"), async (report) => {
    const all = visiblePhotos(await listPhotos(item.id));
    if (all.length === 0) throw new Error("This item has no photos to analyze. Add at least one photo and try again.");
    const { prepared, skipped } = await loadVisionPhotos(all);
    if (prepared.length === 0) throw new Error("None of the photos could be read from storage.");
    if (skipped.length) await ctx.log(`${skipped.length} photo${skipped.length === 1 ? "" : "s"} could not be read and ${skipped.length === 1 ? "was" : "were"} skipped`);
    await report(`Preparing ${prepared.length} photo${prepared.length === 1 ? "" : "s"}`);
    return { images: prepared.map((p) => p.image), photos: prepared.map((p) => p.photo) };
  });

  // ── identify ──
  const hints = hintsFor(item);
  let identified = await ctx.step("identify", labelOf("identify"), async (report) => {
    const out = await ai.identify({ images, userHints: hints });
    await persistProfile(item.id, out, ai.name);
    await applyProfileToItem(item.id, out.profile);
    await report(`Identified as ${out.profile.itemName.value}`, { itemName: out.profile.itemName.value, identityTier: out.profile.identityTier, identityConfidence: out.profile.identityConfidence });
    return out;
  });

  // ── verify ──
  const profile0 = identified.profile;
  const needsBarcode = !!profile0.barcodeVisible && capabilities.barcode;
  const needsEscalation = profile0.identityConfidence < ESCALATION_THRESHOLD;
  if (!needsBarcode && !needsEscalation) {
    const why = profile0.barcodeVisible && !capabilities.barcode ? `Identity is ${Math.round(profile0.identityConfidence * 100)}% confident; a barcode is visible but no barcode lookup key is configured` : `Identity is ${Math.round(profile0.identityConfidence * 100)}% confident; nothing to verify`;
    await ctx.skip("verify", labelOf("verify"), why);
  } else {
    identified = await ctx.step("verify", labelOf("verify"), async (report) => {
      const candidates: string[] = [];
      if (needsBarcode) {
        await report(`Looking up barcode ${profile0.barcodeVisible}`);
        const hit = await lookupBarcode(profile0.barcodeVisible!);
        if (hit) {
          candidates.push([hit.brand, hit.model, hit.title].filter(Boolean).join(" ").trim());
          await report(`Barcode matches "${hit.title}"`);
        } else await report(`Barcode ${profile0.barcodeVisible} not found in the product database`);
      }
      if (!needsEscalation && candidates.length === 0) {
        await report(`Identity is ${Math.round(profile0.identityConfidence * 100)}% confident; keeping the first identification`);
        return identified;
      }
      await report(needsEscalation ? `Identity is only ${Math.round(profile0.identityConfidence * 100)}% confident; running a closer second look` : "Re-checking the identification against the barcode match");
      const second = await ai.identify({ images, userHints: hints, candidates: candidates.length ? candidates : undefined, escalate: true } satisfies IdentifyInput);
      if (second.profile.identityConfidence > profile0.identityConfidence) {
        await persistProfile(item.id, second, ai.name);
        await applyProfileToItem(item.id, second.profile);
        await report(`Confirmed as ${second.profile.itemName.value} (${Math.round(second.profile.identityConfidence * 100)}% confident, up from ${Math.round(profile0.identityConfidence * 100)}%)`, { itemName: second.profile.itemName.value, identityTier: second.profile.identityTier });
        return second;
      }
      await report(`Second look did not improve confidence; keeping ${profile0.itemName.value} at ${Math.round(profile0.identityConfidence * 100)}%`);
      return identified;
    });
  }
  const profile = identified.profile;

  // ── condition ──
  await ctx.step("condition", labelOf("condition"), async (report) => {
    const fresh = await db.item.findUnique({ where: { id: item.id }, select: { attributes: true } });
    const edited = userEdited(fresh?.attributes);
    const data: Prisma.ItemUpdateInput = {};
    if (!edited.has("conditionGrade")) data.conditionGrade = profile.condition.grade;
    if (!edited.has("conditionNotes")) data.conditionNotes = conditionNotesFrom(profile.condition);
    if (Object.keys(data).length) await db.item.update({ where: { id: item.id }, data });
    await report(describeGrading(profile.condition.grade, profile.condition.defects), { grade: profile.condition.grade, defects: profile.condition.defects.length, conditionTier: profile.condition.tier });
  });

  // ── comps ──
  const compsResult = await ctx.step("comps", labelOf("comps"), async (report) => {
    const current = (await db.item.findUnique({ where: { id: item.id } }))!;
    const { result } = await refreshComps(current, profile);
    const n = result.comps.length;
    if (result.error) await report(`eBay search failed (${result.error}); using ${n} demo comparables (labelled, not market evidence)`);
    else if (result.provider === "ebay") await report(n === 0 ? "No comparable listings found on eBay" : `Found ${n} comparable listing${n === 1 ? "" : "s"} on eBay`);
    else await report(n === 0 ? "No demo comparables match this item" : `Using ${n} demo comparables (labelled, not market evidence)`);
    return result;
  });

  // ── price ──
  const priced = await ctx.step("price", labelOf("price"), async (report) => {
    const out = await recomputeEstimate(item.id, { comps: { provider: compsResult.provider, vocabulary: compsResult.vocabulary, query: compsResult.query, error: compsResult.error }, setListPriceIfEmpty: true, strategy: prefs?.pricingStrategy });
    const price = formatMoney(out.result.recommended, "USD", { compact: true });
    const line = out.result.compsUsed === 0 ? `Estimated ${price} without comparables (AI estimate)` : `Recommended ${price} from ${out.result.compsUsed} comparable${out.result.compsUsed === 1 ? "" : "s"}${out.result.basis === "AI_ESTIMATE" ? " (AI estimate)" : ""}`;
    await report(line, { recommendedCents: out.result.recommended, basis: out.result.basis, confidence: out.result.confidence, compsUsed: out.result.compsUsed });
    return out;
  });

  // ── photos ──
  await ctx.step("photos", labelOf("photos"), async (report) => {
    const cover = photos.find((p) => p.kind === "ORIGINAL" || p.kind === "ENHANCED") ?? photos[0]!;
    const already = await db.photo.findFirst({ where: { itemId: item.id, kind: "STUDIO", sourcePhotoId: cover.id, studioMode: "CLEAN_STUDIO" }, select: { id: true } });
    if (already) {
      await report("Clean studio photo already rendered for the cover photo");
      return;
    }
    const queued = await db.job.findFirst({ where: { itemId: item.id, type: "STUDIO_RENDER", status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
    if (queued) {
      await report("Studio render already in progress");
      return;
    }
    const job = await enqueueJob("STUDIO_RENDER", { itemId: item.id, photoId: cover.id, mode: "CLEAN_STUDIO" }, { userId, itemId: item.id, steps: [...STUDIO_STEPS] });
    await report(`Queued a clean studio render of the cover photo${capabilities.segmentation ? "" : " (enhancement only — no background removal provider configured)"}`, { studioJobId: job.id, photoId: cover.id });
  });

  // ── listing ──
  const drafts = await ctx.step("listing", labelOf("listing"), async (report) => {
    const marketplaces = (prefs?.defaultMarketplaces ?? ["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR"]).filter((m): m is keyof typeof MARKETPLACES => m in MARKETPLACES);
    await report(`Writing the master listing from ${countVerified(profile)} verified attributes`);
    const out = await generateListingDrafts(item.id, { marketplaces });
    const names = out.derived.map((d) => (d.marketplace ? MARKETPLACES[d.marketplace].shortName : "")).filter(Boolean);
    const check = out.selfCheck.verdict === "pass" ? "self-check passed" : `self-check: ${out.selfCheck.unsupportedCount} unsupported claim${out.selfCheck.unsupportedCount === 1 ? "" : "s"}`;
    await report(`Wrote the master listing and ${names.length} marketplace draft${names.length === 1 ? "" : "s"} (${names.join(", ")}); ${check}`, { drafts: names.length + 1, selfCheck: out.selfCheck.verdict });
    return out;
  });

  // ── done ──
  await ctx.step("done", labelOf("done"), async (report) => {
    await db.item.update({ where: { id: item.id }, data: { status: "READY" } });
    const price = formatMoney(priced.result.recommended, "USD", { compact: true });
    await notify(userId, { type: "item.ready", title: "Ready for review", body: `${profile.itemName.value} — estimated ${price}. Review the identification, price and listing.`, href: `/items/${item.id}` });
    await audit({ userId, action: "item.analyzed", entityType: "item", entityId: item.id, meta: { jobId: ctx.job.id, provider: ai.name, model: identified.model, identityConfidence: profile.identityConfidence, basis: priced.result.basis, recommended: priced.result.recommended, comps: compsResult.comps.length, drafts: drafts.derived.length + 1 } });
    await report("Ready for review");
  });

  return { itemId: item.id, itemName: profile.itemName.value, identityTier: profile.identityTier, recommendedCents: priced.result.recommended, drafts: drafts.derived.length + 1 };
}

// ─────────────────────────── failure handling ───────────────────────────

async function handleFailure(ctx: JobContext<AnalyzePayload>, itemId: string, err: unknown): Promise<never> {
  const backToDraft = async () => {
    await db.item.updateMany({ where: { id: itemId, status: "ANALYZING" }, data: { status: "DRAFT" } });
  };
  if (err instanceof AiRefusalError) {
    await backToDraft();
    throw new Error(`The AI declined to analyze these photos${err.category ? ` (${err.category})` : ""}. Your photos and item are unchanged — try clearer photos of the item itself, or add details and re-run.`);
  }
  if (err instanceof AiUnavailableError && err.retryable) {
    const job = await db.job.findUnique({ where: { id: ctx.job.id }, select: { attempts: true, maxAttempts: true } });
    const willRetry = !!job && job.attempts < job.maxAttempts;
    if (willRetry) throw new JobRetryableError(`${err.message} Retrying in ${RETRY_DELAY_MS / 1000} s.`, RETRY_DELAY_MS);
    await backToDraft();
    throw new Error(`${err.message} Analysis stopped after ${job?.attempts ?? "several"} attempts; your photos are intact — try again in a few minutes.`);
  }
  await backToDraft();
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}

// ─────────────────────────── helpers ───────────────────────────

function hintsFor(item: Item): IdentifyInput["userHints"] {
  const hints: NonNullable<IdentifyInput["userHints"]> = {};
  if (item.title && item.title !== "Untitled item") hints.title = item.title;
  if (item.brand) hints.brand = item.brand;
  if (item.categoryPath.length) hints.category = item.categoryPath.join(" > ");
  if (item.notes) hints.notes = item.notes;
  return Object.keys(hints).length ? hints : undefined;
}

async function persistProfile(itemId: string, out: IdentifyOutput, provider: string) {
  const data = {
    data: out.profile as unknown as Prisma.InputJsonValue,
    identityConfidence: out.profile.identityConfidence,
    conditionConfidence: out.profile.condition.confidence,
    provider,
    model: out.model,
    promptVersion: out.promptVersion,
  };
  await db.itemProfile.upsert({ where: { itemId }, create: { itemId, ...data }, update: data });
}

/** Field names the seller has edited by hand; the pipeline never overwrites these. */
export function userEdited(attributes: unknown): Set<string> {
  const a = attributes as { userEdited?: unknown } | null;
  return new Set(Array.isArray(a?.userEdited) ? (a!.userEdited as unknown[]).filter((x): x is string => typeof x === "string") : []);
}

/** Mirrors confident profile fields onto the Item (title/brand/model/category/attributes). */
export async function applyProfileToItem(itemId: string, profile: ItemProfile) {
  const item = await db.item.findUnique({ where: { id: itemId }, select: { attributes: true } });
  const attrs = (item?.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes) ? item.attributes : {}) as Record<string, unknown>;
  const edited = userEdited(attrs);
  const data: Prisma.ItemUpdateInput = {};
  if (!edited.has("title") && profile.itemName.confidence >= FIELD_CONFIDENCE) data.title = profile.itemName.value.slice(0, 140);
  if (!edited.has("brand") && profile.brand && profile.brand.confidence >= FIELD_CONFIDENCE) data.brand = profile.brand.value;
  if (!edited.has("model") && profile.model && profile.model.confidence >= FIELD_CONFIDENCE) data.model = profile.model.value;
  if (!edited.has("categoryPath") && profile.categoryConfidence >= FIELD_CONFIDENCE && profile.categoryPath.length) data.categoryPath = profile.categoryPath;

  const specifics: Record<string, string> = {};
  const pick = (name: string, f: ItemProfile["color"]) => {
    if (f && f.confidence >= FIELD_CONFIDENCE && f.value) specifics[name] = f.value;
  };
  pick("Color", profile.color);
  pick("Material", profile.material);
  pick("Size", profile.size);
  pick("Dimensions", profile.dimensions);
  pick("Age", profile.approximateAge);
  pick("Model number", profile.modelNumber);
  for (const a of profile.attributes) pick(a.name, a.field);
  data.attributes = { ...attrs, specifics, userEdited: [...edited] } as Prisma.InputJsonValue;
  await db.item.update({ where: { id: itemId }, data });
}

function countVerified(profile: ItemProfile): number {
  const fields = [profile.itemName, profile.brand, profile.model, profile.modelNumber, profile.color, profile.material, profile.size, profile.dimensions, profile.approximateAge, ...profile.attributes.map((a) => a.field)];
  return fields.filter((f) => f && f.confidence >= FIELD_CONFIDENCE).length;
}

type BarcodeHit = { title: string; brand: string | null; model: string | null };

/** UPCitemdb lookup (research §1.4). Only called when a key is configured; failures are reported, never fatal. */
export async function lookupBarcode(code: string, fetchImpl: typeof fetch = fetch): Promise<BarcodeHit | null> {
  const upc = code.replace(/\D/g, "");
  if (!upc || !env.UPCITEMDB_USER_KEY) return null;
  try {
    const res = await fetchImpl(`https://api.upcitemdb.com/prod/v1/lookup?upc=${encodeURIComponent(upc)}`, {
      headers: { user_key: env.UPCITEMDB_USER_KEY, key_type: "3scale", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: Array<{ title?: string; brand?: string; model?: string }> };
    const first = data.items?.[0];
    if (!first?.title) return null;
    return { title: first.title, brand: first.brand?.trim() || null, model: first.model?.trim() || null };
  } catch (err) {
    console.error("[analyze] barcode lookup failed", err);
    return null;
  }
}

export type { Photo as AnalyzedPhoto };
