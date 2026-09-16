import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { deleteItem, getItemDetail, getItemListDTO, ItemUpdateSchema, updateItem } from "@/lib/inventory";

type Params = { id: string };

/** GET /api/items/[id] → { item: ItemDetailDTO } */
export const GET = withUser<Params>(async (_req, { user, params }) => {
  const item = await getItemDetail(user.id, params.id);
  return json({ item }, { headers: { "Cache-Control": "private, no-store" } });
});

/** PATCH /api/items/[id] body: partial ItemUpdate → { item: ItemListDTO } */
export const PATCH = withUser<Params>(
  async (req, { user, params }) => {
    const patch = await parseBody(req, ItemUpdateSchema);
    await updateItem(user.id, params.id, patch, requestMeta(req));
    const item = await getItemListDTO(user.id, params.id);
    return json({ item });
  },
  { rateLimit: { key: "item-update", limit: 240, windowSeconds: 600 } },
);

/** DELETE /api/items/[id] → { action: "deleted" | "archived", id } (only drafts and archived items are deleted). */
export const DELETE = withUser<Params>(async (req, { user, params }) => {
  const result = await deleteItem(user.id, params.id, requestMeta(req));
  return json(result);
});
