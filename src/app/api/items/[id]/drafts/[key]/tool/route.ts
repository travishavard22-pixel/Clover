import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { getOwnedItem } from "@/lib/items/access";
import { parseDraftKey } from "@/lib/listings/store";
import { proposeListingTool } from "@/lib/listings/tools";

const Schema = z.object({ tool: z.string().min(1).max(40) });

/**
 * POST /api/items/[id]/drafts/[key]/tool { tool } → ToolProposal
 * Asks the AI provider for a rewrite and returns it for diff review. Nothing is saved; the seller
 * applies it with POST …/tool/apply or keeps the current copy.
 */
export const POST = withUser<{ id: string; key: string }>(
  async (req, { user, params }) => {
    const { tool } = await parseBody(req, Schema);
    const item = await getOwnedItem(user.id, params.id);
    const proposal = await proposeListingTool(item.id, parseDraftKey(params.key), tool);
    return json(proposal);
  },
  { rateLimit: { key: "draft-tool", limit: 30, windowSeconds: 600 } },
);
