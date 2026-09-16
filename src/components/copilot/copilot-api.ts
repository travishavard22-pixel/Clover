"use client";
import type { MessageDTO, ThreadDTO } from "@/lib/copilot/threads";
import type { CopilotApplyResult, CopilotProposal } from "@/lib/copilot/proposals";
import { apiRequest } from "@/lib/client/request";

export const copilotApi = {
  threads: () => apiRequest<{ threads: ThreadDTO[] }>("/api/copilot/threads"),
  createThread: (title?: string) => apiRequest<{ thread: ThreadDTO }>("/api/copilot/threads", { method: "POST", json: title ? { title } : {} }),
  thread: (id: string) => apiRequest<{ thread: ThreadDTO; messages: MessageDTO[] }>(`/api/copilot/threads/${encodeURIComponent(id)}`),
  deleteThread: (id: string) => apiRequest<{ ok: true }>(`/api/copilot/threads/${encodeURIComponent(id)}`, { method: "DELETE" }),
  applyProposal: (threadId: string | null, proposal: CopilotProposal) => apiRequest<{ result: CopilotApplyResult }>("/api/copilot/apply-proposal", { method: "POST", json: { threadId: threadId ?? undefined, proposal } }),
};

export const TOOL_LABELS: Record<string, string> = {
  get_inventory_summary: "inventory summary",
  list_items: "item list",
  get_item: "item details",
  get_price_estimate: "price estimate",
  get_offers: "offers",
  get_marketplace_performance: "marketplace performance",
  get_stale_listings: "stale listings",
  propose_price_change: "price proposal",
  rewrite_listing: "listing rewrite",
  evaluate_offer: "offer evaluation",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/^get_/, "").replace(/_/g, " ");
}

/** Tools whose output is an estimate rather than a recorded fact. */
export const ESTIMATE_TOOLS = new Set(["get_price_estimate", "evaluate_offer", "propose_price_change"]);
