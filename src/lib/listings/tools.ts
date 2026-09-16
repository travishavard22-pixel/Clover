import { getAiProvider } from "../ai";
import type { ListingCopy, ListingLength, ListingTone, SelfCheck } from "../ai/schemas";
import { ApiError } from "../api";
import { buildWriteInput, loadListingContext } from "./generate";
import { copyOfDraft, findDraft, type DraftKey } from "./store";

/**
 * The six listing tools shown on the review page. Each is a rewrite request to the AI provider with
 * the current copy as `existing`; the result is a *proposal* the seller reviews as a diff before it is
 * saved (PUT with reason `tone:<id>`). Tools never add facts: the provider re-runs the self-check.
 */

export type ListingToolId = "shorter" | "persuasive" | "casual" | "professional" | "seo" | "condition";

export type ListingTool = {
  id: ListingToolId;
  label: string;
  description: string;
  tone?: ListingTone;
  length?: ListingLength;
  instruction: string;
};

export const LISTING_TOOLS: ListingTool[] = [
  { id: "shorter", label: "Make it shorter", description: "Trims the intro and bullets; keeps every disclosure.", length: "shorter", instruction: "Shorten the copy. Keep the condition, included and unknown sections complete; cut adjectives before facts." },
  { id: "persuasive", label: "Make it more persuasive", description: "Benefit-led phrasing of the same facts.", tone: "persuasive", instruction: "Rewrite with benefit-led phrasing of true facts only. Do not add claims." },
  { id: "casual", label: "Make it more casual", description: "First person, contractions, friendlier headings.", tone: "casual", instruction: "Use a friendly first-person voice with contractions. Same facts." },
  { id: "professional", label: "Make it more professional", description: "Third person, no contractions, formal headings.", tone: "professional", instruction: "Use a neutral third-person voice without contractions. Same facts." },
  { id: "seo", label: "Optimize for search", description: "Front-loads brand, model and type; expands search terms.", tone: "seo", instruction: "Front-load brand, model, product type and the most searched attribute in the title; expand keywords with terms consistent with the verified attributes." },
  { id: "condition", label: "Emphasize condition", description: "Leads with the grade and every defect.", tone: "condition_focus", instruction: "Lead with the condition grade and list every defect with its location and photo reference." },
];

export function listingTool(id: string): ListingTool {
  const t = LISTING_TOOLS.find((x) => x.id === id);
  if (!t) throw new ApiError(400, `Unknown listing tool "${id}"`, "bad_tool");
  return t;
}

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
