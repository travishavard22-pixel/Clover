import { db, Prisma, type Marketplace, type Recommendation } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { enqueueJob } from "../jobs/queue";
import { MARKETPLACES } from "../marketplaces/registry";
import { formatMoney } from "../money";
import { notify } from "../notifications";
import type { ProposalAction, ProposalPayload } from "./types";

export type ApplyMeta = { source: "user" | "auto"; ip?: string | null; userAgent?: string | null };

export type ApplyResult = {
  action: ProposalAction["action"];
  summary: string;
  /** Marketplaces whose listing the seller still has to update by hand. */
  manual: Marketplace[];
  /** Jobs enqueued to push the change through marketplace APIs. */
  jobIds: string[];
};

const STILL_OPEN = new Set(["READY", "NEEDS_ATTENTION", "PUBLISHING", "PUBLISHED", "REQUIRES_USER_ACTION"]);

export function parseProposal(raw: unknown): ProposalPayload {
  if (!raw || typeof raw !== "object" || typeof (raw as { action?: unknown }).action !== "string" || typeof (raw as { key?: unknown }).key !== "string") {
    throw new ApiError(409, "This recommendation has nothing to apply.", "no_proposal");
  }
  return raw as ProposalPayload;
}

/**
 * Executes a proposal for a seller. Every branch re-checks ownership and the precondition the
 * proposal was built on, so a stale recommendation fails with a clear 409 instead of clobbering
 * a change the seller made in the meantime.
 */
export async function executeProposal(userId: string, proposal: ProposalPayload, meta: ApplyMeta): Promise<ApplyResult> {
  switch (proposal.action) {
    case "reprice":
      return applyReprice(userId, proposal, meta);
    case "end_listings":
      return applyEndListings(userId, proposal, meta);
    case "fix_title":
      return applyFixTitle(userId, proposal, meta);
    case "set_shipping_note":
      return applyShippingNote(userId, proposal, meta);
    case "notify":
      return { action: "notify", summary: "Noted.", manual: [], jobIds: [] };
    case "review":
      return { action: "review", summary: "Marked as reviewed.", manual: [], jobIds: [] };
  }
}

async function ownedItem(userId: string, itemId: string) {
  const item = await db.item.findFirst({ where: { id: itemId, userId } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  return item;
}

function attributesOf(item: { attributes: unknown }): Record<string, unknown> {
  return item.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes) ? { ...(item.attributes as Record<string, unknown>) } : {};
}

async function applyReprice(userId: string, p: Extract<ProposalPayload, { action: "reprice" }>, meta: ApplyMeta): Promise<ApplyResult> {
  const item = await ownedItem(userId, p.itemId);
  if (item.status !== "LISTED" && item.status !== "OFFER_RECEIVED" && item.status !== "READY") {
    throw new ApiError(409, `This item is ${item.status.toLowerCase().replace("_", " ")}, so the price no longer applies.`, "stale_proposal");
  }
  if (item.listPrice !== p.fromCents) {
    throw new ApiError(409, `The price changed to ${formatMoney(item.listPrice)} since this was suggested. Run the automations again for a fresh suggestion.`, "stale_proposal");
  }
  const floor = Math.max(100, item.floorPrice ?? 0);
  if (p.toCents < floor) throw new ApiError(409, `Refusing to go below your floor price of ${formatMoney(item.floorPrice)}.`, "below_floor");
  if (p.toCents >= p.fromCents) throw new ApiError(409, "The proposed price is not lower than the current price.", "not_a_drop");

  const attributes = attributesOf(item);
  const history = Array.isArray(attributes.priceHistory) ? (attributes.priceHistory as unknown[]) : [];
  attributes.priceHistory = [...history.slice(-19), { at: new Date().toISOString(), from: p.fromCents, to: p.toCents, source: meta.source === "auto" ? "automation" : "recommendation", reason: p.reason }];
  attributes.lastRepricedAt = new Date().toISOString();
  await db.item.update({ where: { id: item.id }, data: { listPrice: p.toCents, attributes: attributes as Prisma.InputJsonValue } });

  const publications = await db.publication.findMany({ where: { itemId: item.id, userId } });
  const jobIds: string[] = [];
  const manual: Marketplace[] = [];
  for (const pub of publications) {
    if (!STILL_OPEN.has(pub.status)) continue;
    if (pub.mode === "API" && pub.status === "PUBLISHED") {
      const job = await enqueueJob(
        "SYNC_MARKETPLACE",
        { userId, marketplace: pub.marketplace, updatePublicationId: pub.id, priceCents: p.toCents },
        { userId, itemId: item.id, steps: [{ key: "update", label: `Updating the ${MARKETPLACES[pub.marketplace].name} price to ${formatMoney(p.toCents)}` }] },
      );
      jobIds.push(job.id);
    } else {
      manual.push(pub.marketplace);
      // Keep our record honest: the draft price shown for this marketplace is now the new price.
      await db.publication.update({ where: { id: pub.id }, data: { price: p.toCents } });
    }
  }
  await db.listingDraft.updateMany({ where: { itemId: item.id }, data: { price: p.toCents } });
  await audit({ userId, action: meta.source === "auto" ? "automation.reprice" : "item.reprice", entityType: "item", entityId: item.id, meta: { from: p.fromCents, to: p.toCents, jobIds, manual, reason: p.reason }, ip: meta.ip, userAgent: meta.userAgent });
  const manualNote = manual.length ? ` Update ${manual.map((m) => MARKETPLACES[m].name).join(" and ")} by hand.` : "";
  return { action: "reprice", summary: `${item.title} is now ${formatMoney(p.toCents)}.${jobIds.length ? ` Syncing ${jobIds.length} API listing${jobIds.length > 1 ? "s" : ""}.` : ""}${manualNote}`, manual, jobIds };
}

async function applyEndListings(userId: string, p: Extract<ProposalPayload, { action: "end_listings" }>, meta: ApplyMeta): Promise<ApplyResult> {
  const item = await ownedItem(userId, p.itemId);
  const publications = await db.publication.findMany({ where: { id: { in: p.publicationIds }, itemId: item.id, userId } });
  const keepName = p.keepMarketplace ? `on ${MARKETPLACES[p.keepMarketplace].name}` : "elsewhere";
  const attention = { code: "double_sell_guard", message: `Sold ${keepName} — end this listing`, recovery: "Open the listing on the marketplace and end it so nobody else buys it. Then mark this step done." };
  const jobIds: string[] = [];
  const manual: Marketplace[] = [];
  for (const pub of publications) {
    if (!STILL_OPEN.has(pub.status)) continue;
    if (pub.mode === "API" && pub.status === "PUBLISHED") {
      await db.publication.update({ where: { id: pub.id }, data: { attention } });
      const job = await enqueueJob("SYNC_MARKETPLACE", { userId, marketplace: pub.marketplace, endPublicationId: pub.id }, { userId, itemId: item.id, steps: [{ key: "end", label: `Ending the ${MARKETPLACES[pub.marketplace].name} listing` }] });
      jobIds.push(job.id);
    } else {
      await db.publication.update({ where: { id: pub.id }, data: { status: "REQUIRES_USER_ACTION", attention } });
      manual.push(pub.marketplace);
    }
  }
  await audit({ userId, action: meta.source === "auto" ? "automation.end_listings" : "publication.end_requested", entityType: "item", entityId: item.id, meta: { publicationIds: p.publicationIds, jobIds, manual, reason: p.reason }, ip: meta.ip, userAgent: meta.userAgent });
  const parts: string[] = [];
  if (jobIds.length) parts.push(`Ending ${jobIds.length} API listing${jobIds.length > 1 ? "s" : ""}.`);
  if (manual.length) parts.push(`End the ${manual.map((m) => MARKETPLACES[m].name).join(" and ")} listing${manual.length > 1 ? "s" : ""} yourself — it is on your checklist.`);
  if (!parts.length) parts.push("Those listings were already closed.");
  return { action: "end_listings", summary: parts.join(" "), manual, jobIds };
}

async function applyFixTitle(userId: string, p: Extract<ProposalPayload, { action: "fix_title" }>, meta: ApplyMeta): Promise<ApplyResult> {
  const item = await ownedItem(userId, p.itemId);
  const toTitle = p.toTitle.trim();
  if (!toTitle) throw new ApiError(400, "The suggested title is empty.", "bad_title");
  const draft = p.draftId ? await db.listingDraft.findFirst({ where: { id: p.draftId, itemId: item.id } }) : await db.listingDraft.findFirst({ where: { itemId: item.id, marketplace: p.marketplace } });
  if (draft) {
    if (draft.title !== p.fromTitle) throw new ApiError(409, "The title was edited since this was suggested.", "stale_proposal");
    await db.$transaction([
      db.listingDraftVersion.create({ data: { draftId: draft.id, version: draft.version, snapshot: snapshotOf(draft), reason: "Before title-quality fix" } }),
      db.listingDraft.update({ where: { id: draft.id }, data: { title: toTitle, version: { increment: 1 }, generatedBy: meta.source === "auto" ? "automation" : "user" } }),
    ]);
    if (draft.marketplace === null) await db.item.update({ where: { id: item.id }, data: { title: toTitle } });
  } else {
    if (item.title !== p.fromTitle) throw new ApiError(409, "The title was edited since this was suggested.", "stale_proposal");
    await db.item.update({ where: { id: item.id }, data: { title: toTitle } });
  }
  await audit({ userId, action: "listing.title_fixed", entityType: "item", entityId: item.id, meta: { from: p.fromTitle, to: toTitle, issues: p.issues, draftId: draft?.id ?? null }, ip: meta.ip, userAgent: meta.userAgent });
  const livePubs = await db.publication.count({ where: { itemId: item.id, status: "PUBLISHED" } });
  return { action: "fix_title", summary: `Title updated to "${toTitle}".${livePubs ? " Live listings keep their current title until you republish." : ""}`, manual: [], jobIds: [] };
}

function snapshotOf(d: { title: string; description: string; bullets: string[]; conditionText: string; specifics: unknown; keywords: string[]; categoryPath: string[]; categoryId: string | null; price: number | null; shipping: unknown }): Prisma.InputJsonValue {
  return { title: d.title, description: d.description, bullets: d.bullets, conditionText: d.conditionText, specifics: d.specifics as Prisma.InputJsonValue, keywords: d.keywords, categoryPath: d.categoryPath, categoryId: d.categoryId, price: d.price, shipping: d.shipping as Prisma.InputJsonValue };
}

async function applyShippingNote(userId: string, p: Extract<ProposalPayload, { action: "set_shipping_note" }>, meta: ApplyMeta): Promise<ApplyResult> {
  const item = await ownedItem(userId, p.itemId);
  const attributes = attributesOf(item);
  attributes.shippingNote = p.note;
  attributes.shippingChecklist = p.checklist;
  attributes.shippingNoteAt = new Date().toISOString();
  await db.item.update({ where: { id: item.id }, data: { attributes: attributes as Prisma.InputJsonValue } });
  await audit({ userId, action: "item.shipping_note", entityType: "item", entityId: item.id, meta: { source: meta.source, checklist: p.checklist.length }, ip: meta.ip, userAgent: meta.userAgent });
  return { action: "set_shipping_note", summary: `Packing note saved to ${item.title}.`, manual: [], jobIds: [] };
}

/** Applies a stored recommendation and marks it APPLIED. */
export async function applyRecommendation(userId: string, rec: Recommendation, meta: ApplyMeta): Promise<{ recommendation: Recommendation; result: ApplyResult }> {
  if (rec.userId !== userId) throw new ApiError(404, "Recommendation not found", "not_found");
  if (rec.status !== "OPEN" && rec.status !== "SNOOZED") throw new ApiError(409, `This recommendation was already ${rec.status.toLowerCase()}.`, "already_resolved");
  const proposal = parseProposal(rec.proposal);
  const result = await executeProposal(userId, proposal, meta);
  const updated = await db.recommendation.update({ where: { id: rec.id }, data: { status: "APPLIED", resolvedAt: new Date(), snoozedUntil: null } });
  await audit({ userId, action: "recommendation.apply", entityType: "recommendation", entityId: rec.id, meta: { type: rec.type, itemId: rec.itemId, action: proposal.action, source: meta.source }, ip: meta.ip, userAgent: meta.userAgent });
  return { recommendation: updated, result };
}

export async function sendApplyNotification(userId: string, rec: { title: string; itemId: string | null }, result: ApplyResult) {
  await notify(userId, { type: "automation.applied", title: rec.title, body: result.summary, href: rec.itemId ? `/items/${rec.itemId}` : "/automations" });
}
