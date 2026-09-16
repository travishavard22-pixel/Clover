import { json, withUser } from "@/lib/api";
import { filtersFromSearchParams, listItems } from "@/lib/inventory";

/**
 * GET /api/items?q=&status=LISTED&status=READY&marketplace=EBAY&sort=newest&cursor=&limit=24&archived=1
 * → { items: ItemListDTO[], nextCursor: string | null }
 */
export const GET = withUser(async (req, { user }) => {
  const filters = filtersFromSearchParams(new URL(req.url).searchParams);
  const result = await listItems(user.id, filters);
  return json(result, { headers: { "Cache-Control": "private, no-store" } });
});
