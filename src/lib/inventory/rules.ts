/**
 * Pure business rules shared by the status, sold and batch flows. No database access.
 */
import { z } from "zod";
import type { ItemStatus } from "../db";
import { estimateFees } from "../marketplaces/registry";

/** Fields that change alongside a status. */
export function statusSideEffects(from: ItemStatus, to: ItemStatus, now = new Date()): { listedAt?: Date | null; archivedAt?: Date | null } {
  const out: { listedAt?: Date | null; archivedAt?: Date | null } = {};
  if (to === "LISTED" && !["LISTED", "OFFER_RECEIVED"].includes(from)) out.listedAt = now;
  if (to === "ARCHIVED") out.archivedAt = now;
  if (from === "ARCHIVED" && to !== "ARCHIVED") out.archivedAt = null;
  return out;
}

/** Deletes only drafts and archived items; anything else is archived so sales history survives. */
export function deleteOrArchive(status: ItemStatus): "delete" | "archive" {
  return status === "DRAFT" || status === "ARCHIVED" ? "delete" : "archive";
}

/** Where an archived item returns to: READY when it was priced, otherwise DRAFT. */
export function unarchiveTarget(item: { listPrice: number | null; soldAt: Date | null }): ItemStatus {
  return item.soldAt || item.listPrice ? "READY" : "DRAFT";
}

export const MarkSoldSchema = z.object({
  soldPriceCents: z.number().int().min(1, "Sold price must be at least $0.01").max(100_000_000),
  marketplace: z.enum(["EBAY", "FACEBOOK", "OFFERUP", "NEXTDOOR", "CRAIGSLIST", "MERCARI", "POSHMARK"]).optional(),
  feesCents: z.number().int().min(0).max(100_000_000).optional(),
  shippingCostCents: z.number().int().min(0).max(100_000_000).optional(),
  buyerName: z.string().trim().max(120).optional(),
  /** Whether the buyer collected locally (no marketplace fee on local-free marketplaces). */
  local: z.boolean().optional(),
  soldAt: z.coerce.date().optional(),
});
export type MarkSoldInput = z.infer<typeof MarkSoldSchema>;

/** Fees to record on a sale. Explicit fees win; otherwise estimate from the marketplace fee table. */
export function resolveFees(input: MarkSoldInput): number | null {
  if (input.feesCents !== undefined) return input.feesCents;
  if (!input.marketplace) return null;
  return estimateFees(input.marketplace, input.soldPriceCents, { local: input.local });
}

export const DOUBLE_SELL_ATTENTION = (soldOn: string) => ({
  code: "double_sell_guard" as const,
  message: `Sold ${soldOn} — end this listing`,
  recovery: "Open the listing on the marketplace and end it so nobody else buys it. Then mark this step done.",
});
