import { db, Prisma } from "../db";
import { generateSku } from "../sku";

const MAX_SKU_ATTEMPTS = 5;

/**
 * Creates a DRAFT item for a user with a fresh, human-readable SKU.
 * SKUs are random; on the (rare) collision within a user we simply try again.
 */
export async function createItem(userId: string, input: { title?: string } = {}) {
  const title = input.title?.trim() || "Untitled item";
  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    try {
      return await db.item.create({
        data: { userId, sku: generateSku(), title, status: "DRAFT" },
        select: { id: true, sku: true, status: true, title: true, createdAt: true },
      });
    } catch (err) {
      const unique = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!unique || attempt === MAX_SKU_ATTEMPTS - 1) throw err;
    }
  }
  throw new Error("Could not allocate a SKU");
}
