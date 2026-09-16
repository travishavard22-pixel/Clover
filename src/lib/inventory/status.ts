import { db, type Item, type ItemStatus } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { canTransition, ITEM_STATUS_META } from "../items/status";
import { getOwnedItem } from "../items/access";

type Meta = { ip?: string | null; userAgent?: string | null };

/** Fields that change alongside a status. Exported for tests. */
export function statusSideEffects(from: ItemStatus, to: ItemStatus, now = new Date()): { listedAt?: Date | null; archivedAt?: Date | null } {
  const out: { listedAt?: Date | null; archivedAt?: Date | null } = {};
  if (to === "LISTED" && !["LISTED", "OFFER_RECEIVED"].includes(from)) out.listedAt = now;
  if (to === "ARCHIVED") out.archivedAt = now;
  if (from === "ARCHIVED" && to !== "ARCHIVED") out.archivedAt = null;
  return out;
}

export function assertTransition(from: ItemStatus, to: ItemStatus) {
  if (!canTransition(from, to)) {
    throw new ApiError(409, `Can't move an item from ${ITEM_STATUS_META[from].label} to ${ITEM_STATUS_META[to].label}`, "invalid_transition", { from, to });
  }
}

export async function setStatus(userId: string, itemId: string, to: ItemStatus, meta: Meta = {}): Promise<Item> {
  const item = await getOwnedItem(userId, itemId);
  if (to === "SOLD") throw new ApiError(400, "Use the sold flow to record a sale", "use_sold_flow");
  assertTransition(item.status, to);
  if (item.status === to) return item;
  const updated = await db.item.update({ where: { id: itemId }, data: { status: to, ...statusSideEffects(item.status, to) } });
  await audit({ userId, action: "item.status", entityType: "item", entityId: itemId, meta: { from: item.status, to }, ...meta });
  return updated;
}

export async function archiveItem(userId: string, itemId: string, meta: Meta = {}): Promise<Item> {
  const item = await getOwnedItem(userId, itemId);
  if (item.status === "ARCHIVED") return item;
  assertTransition(item.status, "ARCHIVED");
  const updated = await db.item.update({ where: { id: itemId }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  await audit({ userId, action: "item.archived", entityType: "item", entityId: itemId, meta: { from: item.status }, ...meta });
  return updated;
}

export async function unarchiveItem(userId: string, itemId: string, meta: Meta = {}): Promise<Item> {
  const item = await getOwnedItem(userId, itemId);
  if (item.status !== "ARCHIVED") return item;
  const to: ItemStatus = item.soldAt ? "READY" : item.listPrice ? "READY" : "DRAFT";
  const updated = await db.item.update({ where: { id: itemId }, data: { status: to, archivedAt: null } });
  await audit({ userId, action: "item.unarchived", entityType: "item", entityId: itemId, meta: { to }, ...meta });
  return updated;
}

/** Deletes only drafts and archived items; anything else is archived so sales history survives. */
export function deleteOrArchive(status: ItemStatus): "delete" | "archive" {
  return status === "DRAFT" || status === "ARCHIVED" ? "delete" : "archive";
}

export async function deleteItem(userId: string, itemId: string, meta: Meta = {}): Promise<{ action: "deleted" | "archived"; id: string }> {
  const item = await getOwnedItem(userId, itemId);
  if (deleteOrArchive(item.status) === "archive") {
    await archiveItem(userId, itemId, meta);
    return { action: "archived", id: itemId };
  }
  const photos = await db.photo.findMany({ where: { itemId }, select: { storageKey: true, thumbKey: true } });
  await db.item.delete({ where: { id: itemId } });
  await audit({ userId, action: "item.deleted", entityType: "item", entityId: itemId, meta: { sku: item.sku, title: item.title, photos: photos.length }, ...meta });
  // Storage cleanup is best-effort; the row is gone and an orphaned file is harmless.
  const { storage } = await import("../storage");
  await Promise.allSettled(photos.flatMap((p) => [storage.delete(p.storageKey), ...(p.thumbKey ? [storage.delete(p.thumbKey)] : [])]));
  return { action: "deleted", id: itemId };
}
