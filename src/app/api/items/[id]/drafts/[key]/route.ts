import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { ListingCopySchema } from "@/lib/ai/schemas";
import { getOwnedItem } from "@/lib/items/access";
import { factsFromContext } from "@/lib/listings/facts";
import { checkListingClaims } from "@/lib/listings/self-check";
import { loadListingContext } from "@/lib/listings/generate";
import { findDraft, parseDraftKey, saveDraft, toDraftDTO } from "@/lib/listings/store";

type Params = { id: string; key: string };

/** GET /api/items/[id]/drafts/[key] → { draft: ListingDraftDTO } */
export const GET = withUser<Params>(async (_req, { user, params }) => {
  const item = await getOwnedItem(user.id, params.id);
  const draft = await findDraft(item.id, parseDraftKey(params.key));
  if (!draft) return json({ error: { code: "not_found", message: "Draft not found" } }, { status: 404 });
  return json({ draft: toDraftDTO(draft) });
});

/**
 * PUT /api/items/[id]/drafts/[key] ListingCopy → { draft: ListingDraftDTO }
 * Saves the seller's edit as a new version (reason "user edit") and re-runs the fact self-check so
 * the badge stays honest about claims the verified attributes do not support.
 */
export const PUT = withUser<Params>(
  async (req, { user, params }) => {
    const copy = await parseBody(req, ListingCopySchema);
    const item = await getOwnedItem(user.id, params.id);
    const key = parseDraftKey(params.key);
    const existing = await findDraft(item.id, key);
    const ctx = await loadListingContext(item.id);
    const selfCheck = checkListingClaims(factsFromContext(ctx), copy);
    const draft = await saveDraft(item.id, key, copy, { generatedBy: "user", selfCheck, reason: "user edit", price: existing?.price ?? ctx.item.listPrice ?? ctx.estimate?.recommended ?? null });
    await audit({ userId: user.id, action: "item.draft.edited", entityType: "listingDraft", entityId: draft.id, meta: { itemId: item.id, key, version: draft.version, unsupported: selfCheck.unsupportedCount }, ...requestMeta(req) });
    return json({ draft: toDraftDTO(draft) });
  },
  { rateLimit: { key: "draft-edit", limit: 240, windowSeconds: 600 } },
);
