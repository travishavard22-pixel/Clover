import { ApiError } from "../api";
import { getAiProvider } from "../ai";
import type { ListingCopy, SelfCheck } from "../ai/schemas";
import { buildWriteInput, loadListingContext } from "./generate";
import { copyOfDraft, findDraft, type DraftKey } from "./store";
import { findListingTool, type ListingTool, type ListingToolId } from "./tool-catalog";

export { LISTING_TOOLS, type ListingTool, type ListingToolId } from "./tool-catalog";

/** Server lookup: unknown ids are a 400 for the caller. */
export function listingTool(id: string): ListingTool {
  const t = findListingTool(id);
  if (!t) throw new ApiError(400, `Unknown listing tool "${id}"`, "bad_tool");
  return t;
}

/**
 * Runs a listing tool (see `tool-catalog.ts`): a rewrite request to the AI provider with the current
 * copy as `existing`; the result is a *proposal* the seller reviews as a diff before it is saved
 * (POST …/tool/apply with reason `tone:<id>`). Tools never add facts: the provider re-runs the self-check.
 */

export type ToolProposal = { tool: ListingToolId; current: ListingCopy; proposal: ListingCopy; selfCheck: SelfCheck; model: string; provider: string };

/** Produces a proposal for a draft without saving it. */
export async function proposeListingTool(itemId: string, key: DraftKey, toolId: string): Promise<ToolProposal> {
  const tool = listingTool(toolId);
  const draft = await findDraft(itemId, key);
  if (!draft) throw new ApiError(404, "Draft not found. Generate the listing first.", "not_found");
  const ctx = await loadListingContext(itemId);
  const ai = await getAiProvider();
  const current = copyOfDraft(draft);
  const out = await ai.writeListing(buildWriteInput(ctx, key, { existing: current, tone: tool.tone, length: tool.length, instruction: tool.instruction }));
  return { tool: tool.id, current, proposal: out.copy, selfCheck: out.selfCheck, model: out.model, provider: ai.name };
}
