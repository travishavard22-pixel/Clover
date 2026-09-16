import { ApiError } from "@/lib/api";
import { db, type Photo, type Prisma } from "@/lib/db";
import { toPhotoDTO, type PhotoDTO } from "@/lib/items/dto";
import { byOrder, visiblePhotos } from "@/lib/photos/order";
import { listPhotos, originalKeyOf } from "@/lib/photos/store";
import { storage } from "@/lib/storage";
import { parseProvenance, summarizeProvenance, type ProvenanceSummary } from "./provenance";

/**
 * Server-side management of studio renders (Photo rows of kind STUDIO / CONDITION). Renders are
 * additional photos derived from a source: they never hide the source, they sit right after it in
 * the gallery, and deleting one never touches the source or its full-resolution original.
 */

export const RENDER_KINDS: ReadonlySet<Photo["kind"]> = new Set(["STUDIO", "CONDITION"]);

export function isRender(p: Pick<Photo, "kind">): boolean {
  return RENDER_KINDS.has(p.kind);
}

export type RendersView = {
  /** Every photo of the item (sources and renders) in display order, superseded edit sources excluded. */
  photos: PhotoDTO[];
  /** Provenance summary per render id. */
  provenance: Record<string, ProvenanceSummary>;
};

export function provenanceMap(photos: readonly Photo[]): Record<string, ProvenanceSummary> {
  const out: Record<string, ProvenanceSummary> = {};
  for (const p of photos) {
    if (!isRender(p)) continue;
    const prov = parseProvenance(p.provenance);
    if (prov) out[p.id] = summarizeProvenance(prov);
  }
  return out;
}

export async function rendersView(itemId: string): Promise<RendersView> {
  const all = await listPhotos(itemId);
  const visible = visiblePhotos(all);
  return { photos: visible.map((p) => toPhotoDTO(p)), provenance: provenanceMap(visible) };
}

/** Every storage object a render owns: web, thumb, full-resolution studio output and the optional PNG. */
export function renderStorageKeys(p: Photo): string[] {
  const keys = new Set<string>([p.storageKey, originalKeyOf(p)]);
  if (p.thumbKey) keys.add(p.thumbKey);
  const prov = parseProvenance(p.provenance);
  if (prov?.outputs?.pngKey) keys.add(prov.outputs.pngKey);
  return [...keys];
}

async function removeObjects(keys: string[]) {
  await Promise.allSettled(keys.map((k) => storage.delete(k)));
}

/** Re-number the visible sequence 0..n-1 (hidden, superseded sources keep their tail offsets). */
function renumber(photos: readonly Photo[]) {
  return visiblePhotos(photos).map((p, i) => db.photo.update({ where: { id: p.id }, data: { sortOrder: i } }));
}

/**
 * Create a render row positioned directly after its source photo. Everything visible after the
 * source shifts down by one so the render is never the first gallery image unless the seller moves it.
 */
export async function createRenderAfterSource(input: { itemId: string; sourceId: string; data: Omit<Prisma.PhotoUncheckedCreateInput, "itemId" | "sortOrder" | "sourcePhotoId"> }): Promise<Photo> {
  const all = await listPhotos(input.itemId);
  const source = all.find((p) => p.id === input.sourceId);
  if (!source) throw new ApiError(404, "The source photo no longer exists", "missing_source");
  const visible = visiblePhotos(all);
  const sourceVisible = visible.find((p) => p.id === source.id);
  // A superseded (hidden) source is represented by the edit that replaced it; place after that instead.
  const anchor = sourceVisible ?? visible.find((p) => p.sourcePhotoId === source.id) ?? visible[visible.length - 1];
  const position = anchor ? anchor.sortOrder + 1 : 0;
  const shifts = visible.filter((p) => p.sortOrder >= position).sort((a, b) => byOrder(b, a)).map((p) => db.photo.update({ where: { id: p.id }, data: { sortOrder: p.sortOrder + 1 } }));
  const [created] = await db.$transaction([
    db.photo.create({ data: { ...input.data, itemId: input.itemId, sourcePhotoId: source.id, sortOrder: position } }),
    ...shifts,
  ]);
  return created;
}

async function ownedRender(itemId: string, photoId: string): Promise<{ render: Photo; all: Photo[] }> {
  const all = await listPhotos(itemId);
  const render = all.find((p) => p.id === photoId);
  if (!render) throw new ApiError(404, "Photo not found", "not_found");
  if (!isRender(render)) throw new ApiError(400, "That photo is not a studio render", "not_a_render");
  return { render, all };
}

/** Delete a render row and its storage objects. Sources are untouched. */
export async function deleteRender(itemId: string, photoId: string): Promise<Photo[]> {
  const { render, all } = await ownedRender(itemId, photoId);
  const remaining = all.filter((p) => p.id !== render.id);
  await db.$transaction([db.photo.delete({ where: { id: render.id } }), ...renumber(remaining)]);
  await removeObjects(renderStorageKeys(render));
  return listPhotos(itemId);
}

/**
 * "Use original": the source photo takes the render's place in the gallery (so if the render had
 * become the cover, the real photo is the cover again). The render moves to the end of the visible
 * sequence, or is deleted when `discard` is set.
 */
export async function useOriginalForRender(itemId: string, photoId: string, discard: boolean): Promise<{ photos: Photo[]; source: Photo }> {
  const { render, all } = await ownedRender(itemId, photoId);
  const source = render.sourcePhotoId ? all.find((p) => p.id === render.sourcePhotoId) : undefined;
  if (!source) throw new ApiError(410, "The original this render came from is no longer on the item", "missing_source");
  const visible = visiblePhotos(all);
  const order = visible.filter((p) => p.id !== render.id && p.id !== source.id).map((p) => p.id);
  const renderIdx = visible.findIndex((p) => p.id === render.id);
  const sourceIdx = visible.findIndex((p) => p.id === source.id);
  const insertAt = Math.max(0, Math.min(renderIdx === -1 ? sourceIdx : renderIdx, sourceIdx === -1 ? renderIdx : sourceIdx));
  order.splice(insertAt, 0, source.id);
  if (!discard) order.push(render.id);
  const updates = order.map((id, i) => db.photo.update({ where: { id }, data: { sortOrder: i } }));
  if (discard) {
    await db.$transaction([db.photo.delete({ where: { id: render.id } }), ...updates]);
    await removeObjects(renderStorageKeys(render));
  } else {
    await db.$transaction(updates);
  }
  return { photos: await listPhotos(itemId), source };
}
