import type { Marketplace } from "../../db";
import type { ChecklistStep } from "../types";
import { MARKETPLACES } from "../registry";
import type { RenderedListing } from "../render";

/** Research §8.9 — shown verbatim on every assisted flow. */
export function assistedDisclosure(marketplace: Marketplace): string {
  const name = MARKETPLACES[marketplace].name;
  return `${name} does not offer a listing API. You are posting under your own ${name} account and under ${name}'s terms; Clover only prepares the content and records what you tell it.`;
}

export const ASSISTED_ROW_NOTE = "Final publishing requires your confirmation on this marketplace.";

export type ChecklistInput = {
  marketplace: Marketplace;
  itemId: string;
  rendered: Pick<RenderedListing, "title" | "description" | "priceCents" | "categoryHint" | "shippingLine">;
  photoCount: number;
  photoPackHref: string;
};

/**
 * The guided-flow checklist for an assisted marketplace. Every step is something the human does
 * on the marketplace's own site; Clover only supplies copy, files and a plain link.
 */
export function buildChecklist(input: ChecklistInput): ChecklistStep[] {
  const info = MARKETPLACES[input.marketplace];
  const price = input.rendered.priceCents !== null ? (input.rendered.priceCents / 100).toFixed(2) : "";
  const steps: ChecklistStep[] = [
    { key: "copy_title", label: "Copy the title", done: false, copyText: input.rendered.title },
    { key: "copy_description", label: "Copy the description", done: false, copyText: input.rendered.description },
    { key: "photos", label: `Download the photo pack (${Math.min(input.photoCount, info.limits.photosMax)} photos)`, done: false, href: input.photoPackHref },
  ];
  if (info.createUrl) steps.push({ key: "open", label: `Open ${info.shortName}'s create page`, done: false, href: info.createUrl });
  steps.push({ key: "category", label: input.rendered.categoryHint ? `Choose the category (suggested: ${input.rendered.categoryHint})` : "Choose a category", done: false });
  steps.push({ key: "price", label: price ? `Set the price to $${price}` : "Set the price", done: false, copyText: price || undefined });
  steps.push({ key: "location", label: `Confirm location and delivery (${input.rendered.shippingLine})`, done: false });
  steps.push({ key: "posted", label: "I posted it — paste the listing link", done: false });
  return steps;
}

export function endListingChecklist(marketplace: Marketplace, externalUrl: string | null): ChecklistStep[] {
  const info = MARKETPLACES[marketplace];
  return [{ key: "end", label: `End this listing on ${info.name}`, done: false, href: externalUrl ?? info.createUrl ?? undefined }];
}

export function checklistProgress(steps: ChecklistStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

export function parseChecklist(json: unknown): ChecklistStep[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as { key?: unknown }).key === "string")
    .map((s) => ({
      key: String(s.key),
      label: String(s.label ?? ""),
      done: Boolean(s.done),
      href: typeof s.href === "string" ? s.href : undefined,
      copyText: typeof s.copyText === "string" ? s.copyText : undefined,
    }));
}
