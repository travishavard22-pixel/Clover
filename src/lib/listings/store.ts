import { ListingCopySchema, SelfCheckSchema, type ListingCopy, type SelfCheck } from "../ai/schemas";
import { ApiError } from "../api";
import { db, Prisma, type ListingDraft, type ListingDraftVersion, type Marketplace } from "../db";
import { MARKETPLACES } from "../marketplaces/registry";

/**
 * Persistence for listing drafts. One `ListingDraft` per item + marketplace (null = GENERIC master),
 * and a `ListingDraftVersion` snapshot on every change so the seller can review and restore.
 */

export type DraftKey = Marketplace | "generic";
export const DRAFT_KEYS: DraftKey[] = ["generic", ...(Object.keys(MARKETPLACES) as Marketplace[])];

export function parseDraftKey(key: string): DraftKey {
  const k = key.toLowerCase() === "generic" ? "generic" : key.toUpperCase();
  if (k === "generic" || k in MARKETPLACES) return k as DraftKey;
  throw new ApiError(400, `Unknown draft "${key}"; use "generic" or a marketplace id`, "bad_draft_key");
}

export function keyToMarketplace(key: DraftKey): Marketplace | null {
  return key === "generic" ? null : key;
}

export function marketplaceToKey(m: Marketplace | null): DraftKey {
  return m ?? "generic";
}

export function limitsForKey(key: DraftKey): { titleMax: number; descriptionMax: number } {
  return key === "generic" ? { titleMax: 80, descriptionMax: 4000 } : MARKETPLACES[key].limits;
}

export type DraftSnapshot = { version: number; copy: ListingCopy; generatedBy: string; selfCheck: SelfCheck | null; price: number | null; savedAt: string };

export function copyOfDraft(d: ListingDraft): ListingCopy {
  return {
    title: d.title,
    description: d.description,
    bullets: d.bullets,
    conditionText: d.conditionText,
    specifics: ListingCopySchema.shape.specifics.catch([]).parse(d.specifics),
    keywords: d.keywords,
    suggestedCategoryPath: d.categoryPath,
  };
}

export function selfCheckOfDraft(d: Pick<ListingDraft, "selfCheck">): SelfCheck | null {
  const r = SelfCheckSchema.safeParse(d.selfCheck);
  return r.success ? r.data : null;
}

export async function findDraft(itemId: string, key: DraftKey): Promise<ListingDraft | null> {
  return db.listingDraft.findFirst({ where: { itemId, marketplace: keyToMarketplace(key) }, orderBy: { createdAt: "asc" } });
}

export async function listDrafts(itemId: string): Promise<ListingDraft[]> {
  return db.listingDraft.findMany({ where: { itemId }, orderBy: { createdAt: "asc" } });
}

export type SaveDraftMeta = {
  /** "anthropic:claude-opus-5", "demo:clover-demo-1", "derived:demo", "user" */
  generatedBy: string;
  selfCheck: SelfCheck | null;
  /** "generated" | "tone:<tool>" | "user edit" | "restore" */
  reason: string;
  price?: number | null;
  shipping?: Record<string, unknown> | null;
  categoryId?: string | null;
};

function draftData(copy: ListingCopy, meta: SaveDraftMeta) {
  return {
    title: copy.title,
    description: copy.description,
    bullets: copy.bullets,
    conditionText: copy.conditionText,
    specifics: copy.specifics as unknown as Prisma.InputJsonValue,
    keywords: copy.keywords,
    categoryPath: copy.suggestedCategoryPath,
    generatedBy: meta.generatedBy,
    selfCheck: (meta.selfCheck ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    ...(meta.price !== undefined ? { price: meta.price } : {}),
    ...(meta.shipping ? { shipping: meta.shipping as Prisma.InputJsonValue } : {}),
    ...(meta.categoryId !== undefined ? { categoryId: meta.categoryId } : {}),
  };
}

/** Creates or updates the draft and records a version snapshot. Every call bumps `version`. */
export async function saveDraft(itemId: string, key: DraftKey, copy: ListingCopy, meta: SaveDraftMeta): Promise<ListingDraft> {
  const marketplace = keyToMarketplace(key);
  const existing = await findDraft(itemId, key);
  const version = existing ? existing.version + 1 : 1;
  const data = draftData(copy, meta);
  const draft = existing
    ? await db.listingDraft.update({ where: { id: existing.id }, data: { ...data, version } })
    : await db.listingDraft.create({ data: { itemId, marketplace, ...data, version } });
  const snapshot: DraftSnapshot = { version, copy, generatedBy: meta.generatedBy, selfCheck: meta.selfCheck, price: draft.price, savedAt: new Date().toISOString() };
  await db.listingDraftVersion.create({ data: { draftId: draft.id, version, snapshot: snapshot as unknown as Prisma.InputJsonValue, reason: meta.reason } });
  return draft;
}

export async function listDraftVersions(draftId: string): Promise<ListingDraftVersion[]> {
  return db.listingDraftVersion.findMany({ where: { draftId }, orderBy: { version: "desc" } });
}

export function parseSnapshot(v: ListingDraftVersion): DraftSnapshot | null {
  const s = v.snapshot as Partial<DraftSnapshot> | null;
  if (!s || typeof s !== "object") return null;
  const copy = ListingCopySchema.safeParse(s.copy);
  if (!copy.success) return null;
  return { version: v.version, copy: copy.data, generatedBy: s.generatedBy ?? "unknown", selfCheck: SelfCheckSchema.nullable().catch(null).parse(s.selfCheck ?? null), price: s.price ?? null, savedAt: s.savedAt ?? v.createdAt.toISOString() };
}

/** Restores a previous version as a new version (history is never rewritten). */
export async function restoreDraftVersion(itemId: string, key: DraftKey, version: number): Promise<ListingDraft> {
  const draft = await findDraft(itemId, key);
  if (!draft) throw new ApiError(404, "Draft not found", "not_found");
  const row = await db.listingDraftVersion.findFirst({ where: { draftId: draft.id, version } });
  const snap = row ? parseSnapshot(row) : null;
  if (!snap) throw new ApiError(404, `Version ${version} not found`, "not_found");
  return saveDraft(itemId, key, snap.copy, { generatedBy: snap.generatedBy, selfCheck: snap.selfCheck, reason: "restore", price: snap.price });
}

export type ListingDraftDTO = {
  id: string;
  key: DraftKey;
  marketplace: Marketplace | null;
  marketplaceName: string;
  title: string;
  description: string;
  bullets: string[];
  conditionText: string;
  specifics: Array<{ name: string; value: string }>;
  keywords: string[];
  categoryPath: string[];
  price: number | null;
  version: number;
  generatedBy: string;
  selfCheck: SelfCheck | null;
  limits: { titleMax: number; descriptionMax: number };
  updatedAt: string;
};

export function toDraftDTO(d: ListingDraft): ListingDraftDTO {
  const key = marketplaceToKey(d.marketplace);
  const copy = copyOfDraft(d);
  return {
    id: d.id,
    key,
    marketplace: d.marketplace,
    marketplaceName: d.marketplace ? MARKETPLACES[d.marketplace].name : "Master draft",
    title: copy.title,
    description: copy.description,
    bullets: copy.bullets,
    conditionText: copy.conditionText,
    specifics: copy.specifics,
    keywords: copy.keywords,
    categoryPath: copy.suggestedCategoryPath,
    price: d.price,
    version: d.version,
    generatedBy: d.generatedBy,
    selfCheck: selfCheckOfDraft(d),
    limits: limitsForKey(key),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export type DraftVersionDTO = { version: number; reason: string; createdAt: string; snapshot: DraftSnapshot | null };

export function toVersionDTO(v: ListingDraftVersion): DraftVersionDTO {
  return { version: v.version, reason: v.reason, createdAt: v.createdAt.toISOString(), snapshot: parseSnapshot(v) };
}
