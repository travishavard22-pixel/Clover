import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { ListingCopySchema, SelfCheckSchema } from "@/lib/ai/schemas";
import { getOwnedItem } from "@/lib/items/access";
import { findDraft, parseDraftKey, saveDraft, toDraftDTO } from "@/lib/listings/store";
import { listingTool } from "@/lib/listings/tools";

const Schema = z.object({
  tool: z.string().min(1).max(40),
  proposal: ListingCopySchema,
  selfCheck: SelfCheckSchema.nullable().optional(),
  model: z.string().max(120).optional(),
  provider: z.string().max(40).optional(),
});

/**
 * POST /api/items/[id]/drafts/[key]/tool/apply { tool, proposal, selfCheck?, model?, provider? } → { draft }
 * Saves a reviewed proposal as a new version with reason "tone:<tool>".
 */
export const POST = withUser<{ id: string; key: string }>(
  async (req, { user, params }) => {
    const body = await parseBody(req, Schema);
    const tool = listingTool(body.tool);
    const item = await getOwnedItem(user.id, params.id);
    const key = parseDraftKey(params.key);
    const existing = await findDraft(item.id, key);
    const generatedBy = body.provider && body.model ? `${body.provider}:${body.model}` : `tool:${tool.id}`;
    const draft = await saveDraft(item.id, key, body.proposal, { generatedBy, selfCheck: body.selfCheck ?? null, reason: `tone:${tool.id}`, price: existing?.price ?? null });
    await audit({ userId: user.id, action: "item.draft.tool", entityType: "listingDraft", entityId: draft.id, meta: { itemId: item.id, key, tool: tool.id, version: draft.version }, ...requestMeta(req) });
    return json({ draft: toDraftDTO(draft) });
  },
  { rateLimit: { key: "draft-tool-apply", limit: 120, windowSeconds: 600 } },
);
