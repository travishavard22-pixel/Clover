import type { ItemStatus } from "../db";

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "inverse"; description: string }> = {
  DRAFT: { label: "Draft", tone: "neutral", description: "Photos added, not analyzed yet" },
  ANALYZING: { label: "Analyzing", tone: "info", description: "Clover is identifying and pricing this item" },
  READY: { label: "Ready", tone: "accent", description: "Reviewed and ready to publish" },
  LISTED: { label: "Listed", tone: "success", description: "Live on at least one marketplace" },
  OFFER_RECEIVED: { label: "Offer received", tone: "warning", description: "A buyer made an offer" },
  SOLD: { label: "Sold", tone: "inverse", description: "Sold — awaiting shipping or handoff" },
  SHIPPED: { label: "Shipped", tone: "inverse", description: "On its way to the buyer" },
  COMPLETED: { label: "Completed", tone: "neutral", description: "Sale complete" },
  ARCHIVED: { label: "Archived", tone: "neutral", description: "Hidden from active inventory" },
};

export const ACTIVE_STATUSES: ItemStatus[] = ["DRAFT", "ANALYZING", "READY", "LISTED", "OFFER_RECEIVED"];

const transitions: Record<ItemStatus, ItemStatus[]> = {
  DRAFT: ["ANALYZING", "READY", "ARCHIVED"],
  ANALYZING: ["READY", "DRAFT"],
  READY: ["LISTED", "ANALYZING", "DRAFT", "SOLD", "ARCHIVED"],
  LISTED: ["OFFER_RECEIVED", "SOLD", "READY", "ARCHIVED"],
  OFFER_RECEIVED: ["LISTED", "SOLD", "ARCHIVED"],
  SOLD: ["SHIPPED", "COMPLETED", "LISTED"],
  SHIPPED: ["COMPLETED", "SOLD"],
  COMPLETED: ["ARCHIVED", "LISTED"],
  ARCHIVED: ["DRAFT", "READY", "LISTED"],
};

export function canTransition(from: ItemStatus, to: ItemStatus) {
  return from === to || transitions[from].includes(to);
}
