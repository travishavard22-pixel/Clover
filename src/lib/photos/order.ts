/**
 * Pure ordering and visibility rules for an item's photos. Shared by the route handlers and the
 * client so both agree on what "the photos of an item" means.
 *
 * Visibility rule: a photo is *superseded* (hidden from the main sequence) when another photo in
 * the same item was derived from it by an edit (rotate / crop / enhance → kind ENHANCED). Studio and
 * condition renders also carry `sourcePhotoId`, but they are additional images, so they never hide
 * their source. Superseded originals stay in the database and in storage (originals are immutable)
 * and can be restored with "Use original".
 */

export type OrderablePhoto = { id: string; sortOrder: number; kind: "ORIGINAL" | "ENHANCED" | "STUDIO" | "CONDITION"; sourcePhotoId: string | null };

/** Sort offset used to push superseded photos to the tail so naive `ORDER BY sortOrder` consumers still get the edited set first. */
export const SUPERSEDED_SORT_BASE = 1000;

/** Kinds whose derivation replaces the source in the visible sequence. */
export const REPLACING_KINDS: ReadonlySet<OrderablePhoto["kind"]> = new Set(["ENHANCED", "ORIGINAL"]);

export function supersededIds<P extends OrderablePhoto>(photos: readonly P[]): Set<string> {
  const ids = new Set(photos.map((p) => p.id));
  const out = new Set<string>();
  for (const p of photos) {
    if (p.sourcePhotoId && REPLACING_KINDS.has(p.kind) && ids.has(p.sourcePhotoId)) out.add(p.sourcePhotoId);
  }
  return out;
}

export function isSuperseded<P extends OrderablePhoto>(photo: P, photos: readonly P[]): boolean {
  return supersededIds(photos).has(photo.id);
}

/** The photos a seller sees, in display order. */
export function visiblePhotos<P extends OrderablePhoto>(photos: readonly P[]): P[] {
  const hidden = supersededIds(photos);
  return photos.filter((p) => !hidden.has(p.id)).sort(byOrder);
}

export function byOrder(a: OrderablePhoto, b: OrderablePhoto): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

/** Next sortOrder for an uploaded photo: one past the last visible photo. */
export function nextSortOrder<P extends OrderablePhoto>(photos: readonly P[]): number {
  const vis = visiblePhotos(photos);
  return vis.length ? Math.max(...vis.map((p) => p.sortOrder)) + 1 : 0;
}

/** Walks `sourcePhotoId` links up to the root of an edit chain (the immutable original). */
export function rootOf<P extends OrderablePhoto>(photo: P, photos: readonly P[]): P {
  const byId = new Map(photos.map((p) => [p.id, p]));
  let cur = photo;
  const seen = new Set<string>();
  while (cur.sourcePhotoId && REPLACING_KINDS.has(cur.kind) && !seen.has(cur.id)) {
    seen.add(cur.id);
    const src = byId.get(cur.sourcePhotoId);
    if (!src) break;
    cur = src;
  }
  return cur;
}

/** Every photo in the edit chain above `photo` (excluding it), nearest first. */
export function ancestorsOf<P extends OrderablePhoto>(photo: P, photos: readonly P[]): P[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const out: P[] = [];
  let cur = photo;
  const seen = new Set<string>([photo.id]);
  while (cur.sourcePhotoId && REPLACING_KINDS.has(cur.kind)) {
    const src = byId.get(cur.sourcePhotoId);
    if (!src || seen.has(src.id)) break;
    seen.add(src.id);
    out.push(src);
    cur = src;
  }
  return out;
}

/** Every photo derived (transitively) from `photo`, any kind. */
export function descendantsOf<P extends OrderablePhoto>(photo: P, photos: readonly P[]): P[] {
  const out: P[] = [];
  const queue = [photo.id];
  const seen = new Set<string>([photo.id]);
  while (queue.length) {
    const id = queue.shift()!;
    for (const p of photos) {
      if (p.sourcePhotoId === id && !seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
        queue.push(p.id);
      }
    }
  }
  return out;
}

export type OrderValidation = { ok: true; updates: Array<{ id: string; sortOrder: number }> } | { ok: false; reason: string };

/**
 * Validates a requested order against the item's visible photos and returns the sortOrder
 * updates to apply. The order must be a permutation of the visible ids (no duplicates, nothing
 * missing, nothing foreign).
 */
export function planReorder<P extends OrderablePhoto>(photos: readonly P[], order: readonly string[]): OrderValidation {
  const visible = visiblePhotos(photos);
  const visibleIds = new Set(visible.map((p) => p.id));
  if (order.length !== visibleIds.size) return { ok: false, reason: `Expected ${visibleIds.size} photo ids, received ${order.length}` };
  const seen = new Set<string>();
  for (const id of order) {
    if (!visibleIds.has(id)) return { ok: false, reason: `Photo ${id} is not part of this item` };
    if (seen.has(id)) return { ok: false, reason: `Photo ${id} appears twice` };
    seen.add(id);
  }
  return { ok: true, updates: order.map((id, sortOrder) => ({ id, sortOrder })) };
}

/** Moves `id` by `delta` positions within a list (used by the keyboard "Move left/right" alternative to drag). */
export function moveBy<T extends { id: string }>(list: readonly T[], id: string, delta: number): T[] {
  const from = list.findIndex((p) => p.id === id);
  if (from < 0) return [...list];
  const to = Math.max(0, Math.min(list.length - 1, from + delta));
  if (to === from) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
