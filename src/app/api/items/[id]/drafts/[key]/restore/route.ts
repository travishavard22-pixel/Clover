import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { getOwnedItem } from "@/lib/items/access";
import { parseDraftKey, restoreDraftVersion, toDraftDTO } from "@/lib/listings/store";

const Schema = z.object({ version: z.number().int().min(1) });

/** POST /api/items/[id]/drafts/[key]/restore { version } → { draft } (restored as a new version) */
export const POST = withUser<{ id: string; key: string }>(
  async (req, { user, params }) => {
    const { version } = await parseBody(req, Schema);
    const item = await getOwnedItem(user.id, params.id);
    const draft = await restoreDraftVersion(item.id, parseDraftKey(params.key), version);
    await audit({ userId: user.id, action: "item.draft.restored", entityType: "listingDraft", entityId: draft.id, meta: { itemId: item.id, from: version, version: draft.version }, ...requestMeta(req) });
    return json({ draft: toDraftDTO(draft) });
  },
  { rateLimit: { key: "draft-restore", limit: 120, windowSeconds: 600 } },
);
