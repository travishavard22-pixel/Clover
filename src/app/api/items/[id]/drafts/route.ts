import { json, withUser } from "@/lib/api";
import { getOwnedItem } from "@/lib/items/access";
import { listDrafts, toDraftDTO } from "@/lib/listings/store";

/** GET /api/items/[id]/drafts → { drafts: ListingDraftDTO[] } */
export const GET = withUser<{ id: string }>(async (_req, { user, params }) => {
  const item = await getOwnedItem(user.id, params.id);
  const drafts = await listDrafts(item.id);
  return json({ drafts: drafts.map(toDraftDTO) }, { headers: { "Cache-Control": "private, no-store" } });
});
