import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { createItem } from "@/lib/items/create";

const CreateItemSchema = z.object({ title: z.string().trim().max(120).optional() });

/** POST /api/items — creates a DRAFT item with a fresh SKU. Body: { title?: string } → { item: { id, sku, status, title } } */
export const POST = withUser(
  async (req, { user }) => {
    const body = await parseBody(req, CreateItemSchema);
    const item = await createItem(user.id, body);
    await audit({ userId: user.id, action: "item.create", entityType: "item", entityId: item.id, meta: { sku: item.sku }, ...requestMeta(req) });
    return json({ item: { id: item.id, sku: item.sku, status: item.status, title: item.title } }, { status: 201 });
  },
  { rateLimit: { key: "item-create", limit: 60, windowSeconds: 600 } },
);
