import { db } from "../db";
import { ApiError } from "../api";

export async function getOwnedItem(userId: string, itemId: string) {
  const item = await db.item.findFirst({ where: { id: itemId, userId } });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  return item;
}

export async function getOwnedItemFull(userId: string, itemId: string) {
  const item = await db.item.findFirst({
    where: { id: itemId, userId },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      profile: true,
      estimate: true,
      comps: { orderBy: { similarity: "desc" } },
      drafts: { orderBy: { updatedAt: "desc" } },
      publications: { orderBy: { updatedAt: "desc" } },
      offers: { where: { status: "PENDING" }, orderBy: { receivedAt: "desc" } },
    },
  });
  if (!item) throw new ApiError(404, "Item not found", "not_found");
  return item;
}
