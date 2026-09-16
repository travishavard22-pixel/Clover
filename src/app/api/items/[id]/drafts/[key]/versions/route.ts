import { json, withUser } from "@/lib/api";
import { getOwnedItem } from "@/lib/items/access";
import { findDraft, listDraftVersions, parseDraftKey, toVersionDTO } from "@/lib/listings/store";

/** GET /api/items/[id]/drafts/[key]/versions → { versions: DraftVersionDTO[] } (newest first) */
export const GET = withUser<{ id: string; key: string }>(async (_req, { user, params }) => {
  const item = await getOwnedItem(user.id, params.id);
  const draft = await findDraft(item.id, parseDraftKey(params.key));
  if (!draft) return json({ versions: [] });
  const versions = await listDraftVersions(draft.id);
  return json({ versions: versions.map(toVersionDTO) }, { headers: { "Cache-Control": "private, no-store" } });
});
