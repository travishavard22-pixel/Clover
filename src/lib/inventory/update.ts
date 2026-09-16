import { z } from "zod";
import { db, Prisma } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { getOwnedItem } from "../items/access";

const money = z.number().int().min(0).max(100_000_000).nullable();
const text = (max: number) => z.string().trim().max(max).nullable();

/** Fields a seller may edit directly. Status, sold data and photos have their own flows. */
export const ItemUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    brand: text(120),
    model: text(120),
    categoryPath: z.array(z.string().trim().min(1).max(80)).max(8),
    conditionGrade: z.enum(["NEW_SEALED", "NEW_OPEN_BOX", "LIKE_NEW", "VERY_GOOD", "GOOD", "FAIR", "FOR_PARTS"]).nullable(),
    conditionNotes: text(2000),
    acquisitionCost: money,
    listPrice: money,
    floorPrice: money,
    storageLocation: text(120),
    notes: text(4000),
    quantity: z.number().int().min(0).max(10_000),
    acquiredAt: z.coerce.date().nullable(),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_\-.]*$/, "SKU may only contain letters, numbers, dashes, underscores and dots"),
    attributes: z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })
  .refine((v) => v.floorPrice == null || v.listPrice == null || v.floorPrice <= v.listPrice, {
    message: "Floor price cannot be higher than the list price",
    path: ["floorPrice"],
  });

export type ItemUpdate = z.infer<typeof ItemUpdateSchema>;

export async function updateItem(userId: string, itemId: string, patch: ItemUpdate, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const before = await getOwnedItem(userId, itemId);
  if (patch.floorPrice !== undefined && patch.listPrice === undefined && patch.floorPrice !== null && before.listPrice !== null && patch.floorPrice > before.listPrice) {
    throw new ApiError(400, "Floor price cannot be higher than the list price", "validation", [{ path: "floorPrice", message: "Floor price cannot be higher than the list price" }]);
  }
  const data: Prisma.ItemUpdateInput = { ...patch, attributes: patch.attributes as Prisma.InputJsonValue | undefined };
  try {
    const item = await db.item.update({ where: { id: itemId }, data });
    const changed = Object.keys(patch).filter((k) => (before as Record<string, unknown>)[k] !== (patch as Record<string, unknown>)[k]);
    await audit({ userId, action: "item.updated", entityType: "item", entityId: itemId, meta: { fields: changed }, ...meta });
    return item;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ApiError(409, "That SKU is already used by another item", "sku_taken");
    throw err;
  }
}
