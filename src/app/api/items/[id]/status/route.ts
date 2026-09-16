import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { archiveItem, getItemListDTO, setStatus, unarchiveItem } from "@/lib/inventory";

const StatusSchema = z.object({
  status: z.enum(["DRAFT", "READY", "LISTED", "OFFER_RECEIVED", "SHIPPED", "COMPLETED", "ARCHIVED"]),
});

/**
 * POST /api/items/[id]/status { status } → { item: ItemListDTO }
 * SOLD is not accepted here: use POST /api/items/[id]/sold so fees and the double-sell guard run.
 */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const { status } = await parseBody(req, StatusSchema);
    const meta = requestMeta(req);
    if (status === "ARCHIVED") await archiveItem(user.id, params.id, meta);
    else {
      const current = await getItemListDTO(user.id, params.id);
      if (current.status === "ARCHIVED") await unarchiveItem(user.id, params.id, meta);
      await setStatus(user.id, params.id, status, meta);
    }
    const item = await getItemListDTO(user.id, params.id);
    return json({ item });
  },
  { rateLimit: { key: "item-status", limit: 240, windowSeconds: 600 } },
);
