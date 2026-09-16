import { z } from "zod";
import { json, parseQuery, withUser } from "@/lib/api";
import { db } from "@/lib/db";

const QuerySchema = z.object({ q: z.string().trim().max(80).default("") });

/** GET /api/items/search?q= → { items: [{ id, title, sku, status }] } (max 8, this user's items, case-insensitive on title / sku / brand). */
export const GET = withUser(async (req, { user }) => {
  const { q } = parseQuery(req, QuerySchema);
  if (q.length < 1) return json({ items: [] });
  const items = await db.item.findMany({
    where: {
      userId: user.id,
      OR: [{ title: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }],
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, title: true, sku: true, status: true },
  });
  return json({ items });
});
