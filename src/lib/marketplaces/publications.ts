import { db, Prisma, type Item, type ListingDraft, type Marketplace, type Photo, type Publication, type PublicationStatus } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { PUBLISH_STEPS } from "../analysis/steps";
import { toPhotoDTO, type PhotoDTO } from "../items/dto";
import { enqueueJob } from "../jobs/queue";
import { visiblePhotos } from "../photos/order";
import { signedFileUrl } from "../storage";
import type { ChecklistStep } from "./types";
import { ASSISTED_ROW_NOTE, assistedDisclosure, buildChecklist, parseChecklist, updatePriceChecklist } from "./assisted/checklist";
import { photoPackHref } from "./assisted/adapter";
import { pickDraft, priceFor, syntheticDraft, toRenderDraft, toRenderItem } from "./drafts";
import { getAdapter, getConnection, isApiMode, isMarketplace, marketplaceMode, modeExplanation } from "./index";
import { MODE_LABELS, type ConnectionMode } from "./labels";
import { loadSellerPrefs } from "./prefs";
import { selectListingPhotos } from "./photos";
import { ALL_MARKETPLACES, MARKETPLACES, estimateFees } from "./registry";
import { renderListing } from "./render";
import { validateListingUrl } from "./urls";
import { LIVE_STATUSES } from "./sales";

export type PublicationDTO = {
  id: string;
  itemId: string;
  marketplace: Marketplace;
  marketplaceName: string;
  mode: Publication["mode"];
  status: PublicationStatus;
  price: number | null;
  externalId: string | null;
  externalUrl: string | null;
  checklist: ChecklistStep[];
  feePreview: Record<string, unknown> | null;
  attention: { code: string; message: string; recovery: string; field?: string } | null;
  lastError: string | null;
  publishedAt: string | null;
  endedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Latest PUBLISH job for this publication, so the UI can resubscribe to live progress. */
  jobId: string | null;
  jobStatus: string | null;
};

export function toPublicationDTO(p: Publication, job?: { id: string; status: string } | null): PublicationDTO {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: p.id,
    itemId: p.itemId,
    marketplace: p.marketplace,
    marketplaceName: MARKETPLACES[p.marketplace].name,
    mode: p.mode,
    status: p.status,
    price: p.price,
    externalId: p.externalId,
    externalUrl: p.externalUrl,
    checklist: parseChecklist(p.checklist),
    feePreview: (p.feePreview as Record<string, unknown> | null) ?? null,
    attention: (p.attention as PublicationDTO["attention"]) ?? null,
    lastError: p.lastError,
    publishedAt: iso(p.publishedAt),
    endedAt: iso(p.endedAt),
    lastSyncAt: iso(p.lastSyncAt),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    jobId: job?.id ?? null,
    jobStatus: job?.status ?? null,
  };
}

/** Latest PUBLISH job per publication (one query for a whole item). */
export async function latestPublishJobs(itemId: string): Promise<Map<string, { id: string; status: string }>> {
  const jobs = await db.job.findMany({ where: { itemId, type: "PUBLISH" }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, payload: true }, take: 50 });
  const map = new Map<string, { id: string; status: string }>();
  for (const j of jobs) {
    const pid = (j.payload as { publicationId?: string }).publicationId;
    if (pid && !map.has(pid)) map.set(pid, { id: j.id, status: j.status });
  }
  return map;
}

/** Latest PUBLISH job per publication across every item of a user (for the Listings board). */
export async function latestPublishJobsForUser(userId: string): Promise<Map<string, { id: string; status: string }>> {
  const jobs = await db.job.findMany({ where: { userId, type: "PUBLISH" }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, payload: true }, take: 300 });
  const map = new Map<string, { id: string; status: string }>();
  for (const j of jobs) {
    const pid = (j.payload as { publicationId?: string }).publicationId;
    if (pid && !map.has(pid)) map.set(pid, { id: j.id, status: j.status });
  }
  return map;
}

export async function getOwnedPublication(userId: string, publicationId: string) {
  const p = await db.publication.findFirst({ where: { id: publicationId, userId }, include: { item: true, connection: true } });
  if (!p) throw new ApiError(404, "Publication not found", "not_found");
  return p;
}

// ───────────────────────────── Publish hub ─────────────────────────────

export type PublishRowPreview = {
  title: string;
  titleMax: number;
  titleLength: number;
  description: string;
  descriptionMax: number;
  priceCents: number | null;
  fees: number;
  net: number;
  feeNote: string;
  conditionLabel: string;
  categoryHint: string | null;
  photoCount: number;
  photosMax: number;
  shippingLine: string;
  draftSource: "marketplace" | "generic";
  warnings: string[];
};

export type PublishRow = {
  marketplace: Marketplace;
  name: string;
  shortName: string;
  color: string;
  tier: "primary" | "secondary";
  createUrl: string | null;
  mode: ConnectionMode;
  modeLabel: string;
  modeExplanation: string;
  connectable: boolean;
  connectionStatus: "NOT_CONNECTED" | "CONNECTED" | "NEEDS_REAUTH" | "ERROR";
  accountName: string | null;
  isDefault: boolean;
  preview: PublishRowPreview;
  publication: PublicationDTO | null;
  disclosure: string | null;
  rowNote: string | null;
  /** Why this row cannot be published right now (shown instead of the checkbox). */
  blocked: string | null;
};

export type PublishHubData = {
  item: { id: string; sku: string; title: string; status: Item["status"]; listPrice: number | null; floorPrice: number | null; conditionGrade: Item["conditionGrade"]; photoCount: number; cover: PhotoDTO | null };
  photos: PhotoDTO[];
  rows: PublishRow[];
  steps: Array<{ key: string; label: string }>;
};

export async function buildPublishHub(userId: string, itemId: string): Promise<PublishHubData> {
  const item = await db.item.findFirst({ where: { id: itemId, userId }, include: { photos: true, drafts: true, publications: true } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  const [prefs, connections, jobs] = await Promise.all([loadSellerPrefs(userId), db.marketplaceConnection.findMany({ where: { userId } }), latestPublishJobs(itemId)]);
  const photos = visiblePhotos(item.photos);
  const renderItem = toRenderItem(item);
  const renderDrafts = item.drafts.map(toRenderDraft);
  const byMp = new Map(connections.map((c) => [c.marketplace, c]));
  const pubBy = new Map(item.publications.map((p) => [p.marketplace, p]));
  const defaults = prefs.defaultMarketplaces.filter(isMarketplace);
  const ordered = [...defaults, ...ALL_MARKETPLACES.filter((m) => !defaults.includes(m))];

  const rows: PublishRow[] = ordered.map((m) => {
    const info = MARKETPLACES[m];
    const mode = marketplaceMode(m);
    const adapter = getAdapter(m);
    const connectable = adapter.capabilities().connect === "oauth";
    const connection = byMp.get(m) ?? null;
    const rendered = renderListing(m, { item: renderItem, drafts: renderDrafts.length ? renderDrafts : [toRenderDraft(syntheticDraft(item))], prefs });
    const selected = selectListingPhotos(photos, info.limits.photosMax);
    const local = info.supportsLocal && prefs.offersLocalPickup && !(info.supportsShipping && prefs.offersShipping);
    const fees = rendered.priceCents ? estimateFees(m, rendered.priceCents, { local }) : 0;
    const publication = pubBy.get(m) ?? null;
    const connectionStatus = connectable ? (connection?.status ?? "NOT_CONNECTED") : "NOT_CONNECTED";
    let blocked: string | null = null;
    if (connectable && connectionStatus !== "CONNECTED") blocked = connectionStatus === "NEEDS_REAUTH" ? `Reauthorize ${info.shortName} to publish.` : connectionStatus === "ERROR" ? `${info.shortName} connection has an error.` : `Connect ${info.shortName} to publish.`;
    else if (!rendered.priceCents) blocked = "Set a list price first.";
    else if (selected.length === 0) blocked = "Add at least one photo first.";
    return {
      marketplace: m,
      name: info.name,
      shortName: info.shortName,
      color: info.color,
      tier: info.tier,
      createUrl: info.createUrl,
      mode,
      modeLabel: MODE_LABELS[mode],
      modeExplanation: modeExplanation(m, mode),
      connectable,
      connectionStatus,
      accountName: connection?.externalAccountName ?? null,
      isDefault: defaults.includes(m),
      preview: {
        title: rendered.title,
        titleMax: rendered.titleMax,
        titleLength: rendered.title.length,
        description: rendered.description,
        descriptionMax: rendered.descriptionMax,
        priceCents: rendered.priceCents,
        fees,
        net: (rendered.priceCents ?? 0) - fees,
        feeNote: info.fees.note,
        conditionLabel: rendered.conditionLabel,
        categoryHint: rendered.categoryHint,
        photoCount: selected.length,
        photosMax: info.limits.photosMax,
        shippingLine: rendered.shippingLine,
        draftSource: rendered.draftSource,
        warnings: rendered.warnings,
      },
      publication: publication ? toPublicationDTO(publication, jobs.get(publication.id)) : null,
      disclosure: mode === "assisted" ? assistedDisclosure(m) : null,
      rowNote: mode === "assisted" ? ASSISTED_ROW_NOTE : null,
      blocked,
    };
  });

  const photoDtos = photos.map((p) => toPhotoDTO(p));
  return {
    item: { id: item.id, sku: item.sku, title: item.title, status: item.status, listPrice: item.listPrice, floorPrice: item.floorPrice, conditionGrade: item.conditionGrade, photoCount: photos.length, cover: photoDtos[0] ?? null },
    photos: photoDtos,
    rows,
    steps: [...PUBLISH_STEPS],
  };
}

// ───────────────────────────── Create / publish ─────────────────────────────

export type StartPublishResult = { marketplace: Marketplace; publication: PublicationDTO; jobId: string | null };

const SELLABLE: Item["status"][] = ["DRAFT", "READY", "LISTED", "OFFER_RECEIVED", "ARCHIVED"];

/**
 * Creates (or resets) a Publication per marketplace. API marketplaces get a PUBLISH job; assisted
 * ones are prepared synchronously so the guided flow opens immediately. Drafts are never modified.
 */
export async function startPublications(userId: string, itemId: string, marketplaces: Marketplace[], meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<StartPublishResult[]> {
  const item = await db.item.findFirst({ where: { id: itemId, userId }, include: { photos: true, drafts: true, publications: true } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  if (!SELLABLE.includes(item.status)) throw new ApiError(409, `This item is ${item.status.toLowerCase().replace("_", " ")} and cannot be published again.`, "bad_status");
  const photos = visiblePhotos(item.photos);
  if (photos.length === 0) throw new ApiError(400, "Add at least one photo before publishing.", "no_photos");
  const unique = [...new Set(marketplaces)];
  const results: StartPublishResult[] = [];
  for (const marketplace of unique) {
    const existing = item.publications.find((p) => p.marketplace === marketplace) ?? null;
    if (existing && (existing.status === "PUBLISHING" || existing.status === "PUBLISHED" || existing.status === "SOLD")) {
      throw new ApiError(409, `${MARKETPLACES[marketplace].name} is already ${existing.status === "PUBLISHING" ? "being published" : existing.status.toLowerCase()} for this item. End it first to publish again.`, "already_published", { marketplace });
    }
    const draft = pickDraft(item.drafts, marketplace) ?? syntheticDraft(item);
    const price = priceFor(item, draft);
    if (!price) throw new ApiError(400, "Set a list price before publishing.", "no_price", { marketplace });
    const api = isApiMode(marketplace);
    const connection = api ? await getConnection(userId, marketplace) : null;
    if (api && (!connection || connection.status !== "CONNECTED")) throw new ApiError(409, `Connect ${MARKETPLACES[marketplace].shortName} before publishing there.`, "not_connected", { marketplace });

    const data = {
      mode: api ? ("API" as const) : ("ASSISTED" as const),
      status: api ? ("PUBLISHING" as const) : ("READY" as const),
      price,
      connectionId: connection?.id ?? null,
      attention: Prisma.DbNull,
      lastError: null,
      endedAt: null,
      checklist: [] as unknown as Prisma.InputJsonValue,
    };
    let publication = existing
      ? await db.publication.update({ where: { id: existing.id }, data })
      : await db.publication.create({ data: { itemId, userId, marketplace, ...data } });

    let jobId: string | null = null;
    if (api) {
      const job = await enqueueJob("PUBLISH", { publicationId: publication.id }, { userId, itemId, steps: [...PUBLISH_STEPS] });
      jobId = job.id;
    } else {
      publication = await prepareAssisted(publication, item, draft, photos);
    }
    await audit({ userId, action: "publication.start", entityType: "publication", entityId: publication.id, meta: { marketplace, mode: data.mode, jobId }, ...meta });
    results.push({ marketplace, publication: toPublicationDTO(publication, jobId ? { id: jobId, status: "QUEUED" } : null), jobId });
  }
  return results;
}

/** Runs the assisted adapter's publish() inline — it only builds a checklist, no network. */
async function prepareAssisted(publication: Publication, item: Item, draft: ListingDraft, photos: Photo[]): Promise<Publication> {
  const adapter = getAdapter(publication.marketplace);
  const prepared = await adapter.prepare({ item, draft, photos, connection: null, photoUrl: async (p, s) => signedFileUrl(p.storageKey, s, false) });
  const result = await adapter.publish({ publication, item, draft, photos, connection: null, prepared, report: async () => {} });
  if (result.status !== "REQUIRES_USER_ACTION") throw new ApiError(500, "Assisted publishing returned an unexpected result", "assisted_unexpected");
  return db.publication.update({
    where: { id: publication.id },
    data: { status: "REQUIRES_USER_ACTION", checklist: result.checklist as unknown as Prisma.InputJsonValue, externalUrl: result.externalUrl ?? publication.externalUrl, feePreview: { fees: prepared.feePreview.fees, net: prepared.feePreview.net, note: prepared.feePreview.note, source: "estimate" } },
  });
}

/** Rebuilds an assisted checklist from the current draft (used by re-publish and when the sheet is reopened after edits). */
export async function rebuildAssistedChecklist(publication: Publication): Promise<Publication> {
  const item = await db.item.findFirst({ where: { id: publication.itemId, userId: publication.userId }, include: { photos: true, drafts: true } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  const draft = pickDraft(item.drafts, publication.marketplace) ?? syntheticDraft(item);
  const prefs = await loadSellerPrefs(publication.userId);
  const rendered = renderListing(publication.marketplace, { item: toRenderItem(item), drafts: [toRenderDraft(draft)], prefs });
  const photoCount = selectListingPhotos(visiblePhotos(item.photos), MARKETPLACES[publication.marketplace].limits.photosMax).length;
  const fresh = buildChecklist({ marketplace: publication.marketplace, itemId: item.id, rendered, photoCount, photoPackHref: photoPackHref(item.id, publication.marketplace) });
  const old = parseChecklist(publication.checklist);
  const merged = fresh.map((s) => ({ ...s, done: old.find((o) => o.key === s.key)?.done ?? false }));
  return db.publication.update({ where: { id: publication.id }, data: { checklist: merged as unknown as Prisma.InputJsonValue, price: rendered.priceCents ?? publication.price } });
}

// ───────────────────────────── Checklist / confirm ─────────────────────────────

export async function setChecklistStep(userId: string, publicationId: string, key: string, done: boolean): Promise<Publication> {
  const p = await getOwnedPublication(userId, publicationId);
  const steps = parseChecklist(p.checklist);
  if (!steps.some((s) => s.key === key)) throw new ApiError(404, "Unknown checklist step", "bad_step");
  const next = steps.map((s) => (s.key === key ? { ...s, done } : s));
  return db.publication.update({ where: { id: p.id }, data: { checklist: next as unknown as Prisma.InputJsonValue } });
}

/**
 * The seller says they posted it. Optional pasted URL is validated against the marketplace's own
 * domain and stored as a plain link — Clover never fetches it.
 */
export async function confirmAssistedPublished(userId: string, publicationId: string, externalUrl: string | null | undefined, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<Publication> {
  const p = await getOwnedPublication(userId, publicationId);
  if (p.mode !== "ASSISTED") throw new ApiError(409, "Only assisted publications are confirmed by hand", "not_assisted");
  if (p.status === "SOLD") throw new ApiError(409, "This publication is already sold", "bad_status");
  let url: string | null = p.externalUrl;
  if (externalUrl && externalUrl.trim()) {
    const check = validateListingUrl(p.marketplace, externalUrl);
    if (!check.ok) throw new ApiError(400, check.reason, "bad_url", [{ path: "externalUrl", message: check.reason }]);
    url = check.url;
  }
  const steps = parseChecklist(p.checklist).map((s) => ({ ...s, done: true }));
  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    const pub = await tx.publication.update({ where: { id: p.id }, data: { status: "PUBLISHED", externalUrl: url, publishedAt: p.publishedAt ?? now, endedAt: null, attention: Prisma.DbNull, lastError: null, checklist: steps as unknown as Prisma.InputJsonValue } });
    if (p.item.status === "DRAFT" || p.item.status === "READY" || p.item.status === "ARCHIVED") await tx.item.update({ where: { id: p.itemId }, data: { status: "LISTED", listedAt: p.item.listedAt ?? now } });
    else if (!p.item.listedAt) await tx.item.update({ where: { id: p.itemId }, data: { listedAt: now } });
    return pub;
  });
  await audit({ userId, action: "publication.confirmed", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, externalUrl: url }, ...meta });
  return updated;
}

// ───────────────────────────── End / price / republish ─────────────────────────────

export type MutationResult = { publication: Publication; jobId: string | null };

/**
 * Ends a listing. API: a SYNC_MARKETPLACE job calls the adapter. Assisted: the seller ends it on
 * the marketplace; `confirmed` records that they did.
 */
export async function endPublication(userId: string, publicationId: string, opts: { confirmed?: boolean }, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<MutationResult> {
  const p = await getOwnedPublication(userId, publicationId);
  if (p.status === "ENDED" || p.status === "SOLD") throw new ApiError(409, `This listing is already ${p.status.toLowerCase()}`, "bad_status");
  const info = MARKETPLACES[p.marketplace];
  const adapter = getAdapter(p.marketplace);
  if (p.mode === "API" && adapter.capabilities().end === "api" && !opts.confirmed) {
    if (p.status !== "PUBLISHED") {
      // Never published on the marketplace: nothing to withdraw.
      const publication = await db.publication.update({ where: { id: p.id }, data: { status: "ENDED", endedAt: new Date(), attention: Prisma.DbNull } });
      await audit({ userId, action: "publication.ended", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, how: "never_live" }, ...meta });
      return { publication, jobId: null };
    }
    const job = await enqueueJob("SYNC_MARKETPLACE", { userId, marketplace: p.marketplace, endPublicationId: p.id }, { userId, itemId: p.itemId, steps: [{ key: "end", label: `Ending the ${info.name} listing` }] });
    await audit({ userId, action: "publication.end.requested", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, jobId: job.id }, ...meta });
    return { publication: p, jobId: job.id };
  }
  if (opts.confirmed || p.status !== "PUBLISHED") {
    const publication = await db.publication.update({ where: { id: p.id }, data: { status: "ENDED", endedAt: new Date(), attention: Prisma.DbNull, lastError: null } });
    await db.recommendation.updateMany({ where: { userId, type: "DOUBLE_SELL_GUARD", status: "OPEN", proposal: { path: ["publicationIds"], array_contains: [p.id] } }, data: { status: "APPLIED", resolvedAt: new Date() } });
    await audit({ userId, action: "publication.ended", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, how: opts.confirmed ? "user_confirmed" : "never_live" }, ...meta });
    return { publication, jobId: null };
  }
  const res = await adapter.end({ publication: p, connection: p.connection, reason: "withdrawn" });
  const publication = await db.publication.update({
    where: { id: p.id },
    data: { status: "REQUIRES_USER_ACTION", attention: { code: "end_listing", message: res.message ?? `End this listing on ${info.name}.`, recovery: "Open the listing, end it there, then confirm here." }, checklist: [{ key: "end", label: `End this listing on ${info.name}`, done: false, href: res.externalUrl ?? p.externalUrl ?? info.createUrl ?? undefined }] as unknown as Prisma.InputJsonValue },
  });
  return { publication, jobId: null };
}

/** Changes a live listing's price. API: SYNC_MARKETPLACE job; assisted: a short checklist for the seller. */
export async function updatePublicationPrice(userId: string, publicationId: string, priceCents: number, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<MutationResult> {
  const p = await getOwnedPublication(userId, publicationId);
  if (p.status !== "PUBLISHED") throw new ApiError(409, "Only live listings can be repriced", "bad_status");
  const info = MARKETPLACES[p.marketplace];
  const adapter = getAdapter(p.marketplace);
  if (p.mode === "API" && adapter.capabilities().update === "api") {
    const job = await enqueueJob("SYNC_MARKETPLACE", { userId, marketplace: p.marketplace, updatePublicationId: p.id, priceCents }, { userId, itemId: p.itemId, steps: [{ key: "update", label: `Updating the ${info.name} price` }] });
    await audit({ userId, action: "publication.price.requested", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, priceCents, jobId: job.id }, ...meta });
    return { publication: p, jobId: job.id };
  }
  const publication = await db.publication.update({
    where: { id: p.id },
    data: { price: priceCents, status: "REQUIRES_USER_ACTION", attention: { code: "update_price", message: `Change the price to ${(priceCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} on ${info.name}.`, recovery: "Open your listing, update the price there, then confirm here." }, checklist: updatePriceChecklist(p.marketplace, p.externalUrl, priceCents) as unknown as Prisma.InputJsonValue },
  });
  await audit({ userId, action: "publication.price.assisted", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, priceCents }, ...meta });
  return { publication, jobId: null };
}

/** Confirms an assisted price update or end step the seller completed by hand. */
export async function confirmAssistedAction(userId: string, publicationId: string, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<Publication> {
  const p = await getOwnedPublication(userId, publicationId);
  const attention = (p.attention as { code?: string } | null)?.code;
  if (p.status !== "REQUIRES_USER_ACTION") throw new ApiError(409, "Nothing to confirm", "bad_status");
  if (attention === "end_listing" || attention === "double_sell_guard") {
    return (await endPublication(userId, publicationId, { confirmed: true }, meta)).publication;
  }
  if (attention === "update_price") {
    const publication = await db.publication.update({ where: { id: p.id }, data: { status: "PUBLISHED", attention: Prisma.DbNull, checklist: [] as unknown as Prisma.InputJsonValue } });
    await audit({ userId, action: "publication.price.confirmed", entityType: "publication", entityId: p.id, meta: { marketplace: p.marketplace, priceCents: p.price }, ...meta });
    return publication;
  }
  // Plain assisted publish checklist: same as "I posted it".
  return confirmAssistedPublished(userId, publicationId, null, meta);
}

/** Publishes again after an end/failure/attention: API → new PUBLISH job; assisted → fresh checklist. */
export async function republish(userId: string, publicationId: string, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<MutationResult> {
  const p = await getOwnedPublication(userId, publicationId);
  if (p.status === "PUBLISHED" || p.status === "PUBLISHING") throw new ApiError(409, "This listing is already live", "bad_status");
  if (p.status === "SOLD") throw new ApiError(409, "This item sold on this marketplace", "bad_status");
  const [result] = await startPublications(userId, p.itemId, [p.marketplace], meta);
  const fresh = await db.publication.findUniqueOrThrow({ where: { id: p.id } });
  return { publication: fresh, jobId: result?.jobId ?? null };
}

export function isLive(status: PublicationStatus): boolean {
  return LIVE_STATUSES.has(status);
}
