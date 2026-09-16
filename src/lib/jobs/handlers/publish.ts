import { z } from "zod";
import { db, Prisma } from "../../db";
import { audit } from "../../audit";
import { PUBLISH_STEPS } from "../../analysis/steps";
import { formatMoney } from "../../money";
import { notify } from "../../notifications";
import { storage } from "../../storage";
import { visiblePhotos } from "../../photos/order";
import { getAdapter } from "../../marketplaces";
import { pickDraft, syntheticDraft } from "../../marketplaces/drafts";
import { isPhased, type StepRunner } from "../../marketplaces/phased";
import { loadSellerPrefs } from "../../marketplaces/prefs";
import { MARKETPLACES } from "../../marketplaces/registry";
import type { PublishResult } from "../../marketplaces/types";
import { JobRetryableError, type JobContext } from "../types";
import type { registerJobHandler } from "../runner";

const Payload = z.object({ publicationId: z.string().min(1) });

const SKIP_REASON: Record<string, (name: string) => string> = {
  photos: (n) => `${n} has no upload API — photos go in the pack you download`,
  category: (n) => `You choose the category on ${n}`,
  fees: (n) => `${n} shows fees at checkout, if any`,
};

/**
 * PUBLISH: takes one Publication from PUBLISHING to PUBLISHED / NEEDS_ATTENTION / FAILED /
 * REQUIRES_USER_ACTION through the marketplace adapter. Every status line is a real step. The
 * seller's drafts are read, never written.
 */
export async function runPublish(ctx: JobContext): Promise<{ publicationId: string; status: string }> {
  const { publicationId } = Payload.parse(ctx.payload);
  const publication = await db.publication.findUnique({ where: { id: publicationId }, include: { item: { include: { photos: true, drafts: true } }, connection: true } });
  if (!publication) throw new Error(`Publication ${publicationId} no longer exists`);
  const { item } = publication;
  const info = MARKETPLACES[publication.marketplace];
  const adapter = getAdapter(publication.marketplace);
  const draft = pickDraft(item.drafts, publication.marketplace) ?? syntheticDraft(item);
  const photos = visiblePhotos(item.photos);

  if (publication.status !== "PUBLISHING") await db.publication.update({ where: { id: publication.id }, data: { status: "PUBLISHING", lastError: null } });

  const prepared = await ctx.step("prepare", "Preparing the listing", async (report) => {
    const p = await adapter.prepare({ item, draft, photos, connection: publication.connection, photoUrl: (photo, s) => storage.url(photo.storageKey, s) });
    const bits = [`"${p.title}" (${p.title.length}/${info.limits.titleMax} chars)`, `${Math.min(photos.length, info.limits.photosMax)} photo${photos.length === 1 ? "" : "s"}`, p.priceCents ? formatMoney(p.priceCents) : "no price"];
    await report(`Prepared for ${info.name}: ${bits.join(", ")}`, { warnings: p.warnings });
    for (const w of p.warnings) await ctx.log(w);
    return p;
  });

  const run: StepRunner = (key, label, fn) => ctx.step(key, label, fn);
  let result: PublishResult;
  if (isPhased(adapter)) {
    result = await adapter.publishPhased({ publication, item, draft, photos, connection: publication.connection, prepared, report: (m) => ctx.log(m) }, run);
    // Any declared step the adapter did not reach (early NEEDS_ATTENTION) is marked skipped so the checklist is honest.
    for (const s of PUBLISH_STEPS) {
      const st = ctx.job.steps.find((x) => x.key === s.key);
      if (st && st.status === "pending") await ctx.skip(s.key, s.label, result.status === "PUBLISHED" ? "Not needed" : "Stopped before this step");
    }
  } else {
    for (const key of ["photos", "category", "fees"] as const) {
      const step = PUBLISH_STEPS.find((s) => s.key === key)!;
      await ctx.skip(step.key, step.label, SKIP_REASON[key]!(info.shortName));
    }
    result = await ctx.step("publish", `Preparing the ${info.shortName} checklist`, async (report) => adapter.publish({ publication, item, draft, photos, connection: publication.connection, prepared, report: (m) => report(m) }));
  }

  return applyResult({ ctx, publicationId: publication.id, itemId: item.id, userId: publication.userId, itemTitle: item.title, marketplace: publication.marketplace, result, prepared });
}

async function applyResult(input: { ctx: JobContext; publicationId: string; itemId: string; userId: string; itemTitle: string; marketplace: keyof typeof MARKETPLACES; result: PublishResult; prepared: { priceCents: number } }): Promise<{ publicationId: string; status: string }> {
  const { ctx, result, publicationId, itemId, userId } = input;
  const info = MARKETPLACES[input.marketplace];
  switch (result.status) {
    case "PUBLISHED": {
      const now = new Date();
      await db.$transaction(async (tx) => {
        await tx.publication.update({
          where: { id: publicationId },
          data: { status: "PUBLISHED", externalId: result.externalId, externalUrl: result.externalUrl, externalMeta: (result.externalMeta ?? {}) as Prisma.InputJsonValue, feePreview: (result.feePreview ?? Prisma.DbNull) as Prisma.InputJsonValue, publishedAt: now, endedAt: null, attention: Prisma.DbNull, lastError: null, checklist: [] as unknown as Prisma.InputJsonValue, price: input.prepared.priceCents },
        });
        const item = await tx.item.findUnique({ where: { id: itemId }, select: { status: true, listedAt: true } });
        if (item && (item.status === "DRAFT" || item.status === "READY" || item.status === "ARCHIVED")) await tx.item.update({ where: { id: itemId }, data: { status: "LISTED", listedAt: item.listedAt ?? now } });
        else if (item && !item.listedAt) await tx.item.update({ where: { id: itemId }, data: { listedAt: now } });
      });
      const prefs = await loadSellerPrefs(userId);
      if (prefs.notifyPublishing) await notify(userId, { type: "publication.published", title: `Live on ${info.name}`, body: `${input.itemTitle} is live on ${info.name}${result.externalUrl ? "." : " (no link returned)."}`, href: result.externalUrl ?? `/items/${itemId}/publish` });
      await audit({ userId, action: "publication.published", entityType: "publication", entityId: publicationId, meta: { marketplace: input.marketplace, externalId: result.externalId, externalUrl: result.externalUrl } });
      return { publicationId, status: "PUBLISHED" };
    }
    case "NEEDS_ATTENTION": {
      await db.publication.update({ where: { id: publicationId }, data: { status: "NEEDS_ATTENTION", attention: result.attention as Prisma.InputJsonValue, lastError: null } });
      await ctx.log(`Needs attention: ${result.attention.message} ${result.attention.recovery}`, { attention: result.attention });
      const prefs = await loadSellerPrefs(userId);
      if (prefs.notifyPublishing) await notify(userId, { type: "publication.attention", title: `${info.name} needs a fix`, body: `${input.itemTitle}: ${result.attention.message} ${result.attention.recovery}`, href: `/items/${itemId}/publish` });
      await audit({ userId, action: "publication.needs_attention", entityType: "publication", entityId: publicationId, meta: { marketplace: input.marketplace, attention: result.attention } });
      return { publicationId, status: "NEEDS_ATTENTION" };
    }
    case "REQUIRES_USER_ACTION": {
      await db.publication.update({ where: { id: publicationId }, data: { status: "REQUIRES_USER_ACTION", checklist: result.checklist as unknown as Prisma.InputJsonValue, externalUrl: result.externalUrl ?? undefined, attention: Prisma.DbNull, lastError: null } });
      await ctx.log(result.message);
      return { publicationId, status: "REQUIRES_USER_ACTION" };
    }
    case "FAILED": {
      await db.publication.update({ where: { id: publicationId }, data: { status: "FAILED", lastError: result.error } });
      await audit({ userId, action: "publication.failed", entityType: "publication", entityId: publicationId, meta: { marketplace: input.marketplace, error: result.error, retryable: result.retryable } });
      if (result.retryable && ctx.job.attempts < 3) throw new JobRetryableError(result.error, 15_000);
      const prefs = await loadSellerPrefs(userId);
      if (prefs.notifyPublishing) await notify(userId, { type: "publication.failed", title: `Publishing to ${info.name} failed`, body: `${input.itemTitle}: ${result.error} Nothing was posted; your draft is unchanged.`, href: `/items/${itemId}/publish` });
      throw new Error(result.error);
    }
  }
}

export function register(r: typeof registerJobHandler) {
  r("PUBLISH", runPublish);
}
