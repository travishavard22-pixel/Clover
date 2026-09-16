import type { ItemProfile, ListingCopy, ListingLength, ListingTone, OfferAdvice, SelfCheck, StudioQa } from "./schemas";

export type ImageInput = { data: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; label?: string };

export type IdentifyInput = {
  images: ImageInput[];
  userHints?: { title?: string; brand?: string; category?: string; notes?: string };
  /** Candidate labels from comps or barcode lookup for a second pass. */
  candidates?: string[];
  escalate?: boolean;
};

export type IdentifyOutput = { profile: ItemProfile; model: string; promptVersion: string; usage?: { inputTokens: number; outputTokens: number } };

export type WriteListingInput = {
  profile: ItemProfile;
  verifiedAttributes: Array<{ name: string; value: string }>;
  unknowns: string[];
  marketplace: "GENERIC" | "EBAY" | "FACEBOOK" | "OFFERUP" | "NEXTDOOR" | "CRAIGSLIST" | "MERCARI" | "POSHMARK";
  priceCents?: number | null;
  shipping: { offersShipping: boolean; offersLocalPickup: boolean; note?: string | null; city?: string | null };
  compsVocabulary?: string[];
  tone?: ListingTone;
  length?: ListingLength;
  /** For rewrites: the current copy and the instruction. */
  existing?: ListingCopy;
  instruction?: string;
  limits: { titleMax: number; descriptionMax: number };
};

export type WriteListingOutput = { copy: ListingCopy; selfCheck: SelfCheck; model: string; promptVersion: string };

export type StudioQaInput = { original: ImageInput; generated: ImageInput; mode: string };

export type OfferAdviceInput = {
  itemTitle: string;
  listPriceCents: number;
  offerCents: number;
  floorPriceCents: number | null;
  estimate: { quickSale: number; recommended: number; maxValue: number } | null;
  daysListed: number;
  buyerMessage: string | null;
  marketplace: string;
  feeRate: number;
};

export type CopilotTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

export type CopilotTurn = { role: "user" | "assistant"; content: string };

export type CopilotEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "done"; text: string; toolTrace: Array<{ name: string; input: Record<string, unknown>; summary: string }> }
  | { type: "error"; message: string };

export interface AiProvider {
  readonly name: "anthropic" | "demo";
  identify(input: IdentifyInput): Promise<IdentifyOutput>;
  writeListing(input: WriteListingInput): Promise<WriteListingOutput>;
  studioQa(input: StudioQaInput): Promise<StudioQa>;
  offerAdvice(input: OfferAdviceInput): Promise<OfferAdvice>;
  copilot(input: { system: string; history: CopilotTurn[]; tools: CopilotTool[] }): AsyncGenerator<CopilotEvent>;
}
