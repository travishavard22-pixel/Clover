import type { ListingLength, ListingTone } from "../ai/schemas";

/**
 * The six listing tools shown on the review page. Client-safe (no provider or database imports):
 * the UI renders these; `tools.ts` runs them on the server.
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

export function findListingTool(id: string): ListingTool | undefined {
  return LISTING_TOOLS.find((x) => x.id === id);
}

/** Client-safe lookup: throws a plain Error (the server wraps it as a 400). */
export function listingTool(id: string): ListingTool {
  const t = findListingTool(id);
  if (!t) throw new Error(`Unknown listing tool "${id}"`);
  return t;
}
