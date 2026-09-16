"use client";
import type { ListingCopy, SelfCheck } from "@/lib/ai/schemas";
import type { ConditionGrade } from "@/lib/db";
import type { ItemDetailDTO } from "@/lib/inventory/detail";
import type { ItemListDTO } from "@/lib/inventory/types";
import type { ItemSummary, ItemSummaryDTO, ProfileDTO } from "@/lib/items/summary";
import type { DraftKey, DraftVersionDTO, ListingDraftDTO } from "@/lib/listings/store";
import type { ListingToolId, ToolProposal } from "@/lib/listings/tools";
import type { CompDTO, EstimateDTO } from "@/lib/pricing/dto";

export class ItemApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    let message = res.status === 429 ? "Too many requests — give it a moment and try again." : `Request failed (${res.status})`;
    let code = "error";
    let details: unknown;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string; details?: unknown } };
      message = body.error?.message ?? message;
      code = body.error?.code ?? code;
      details = body.error?.details;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ItemApiError(res.status, message, code, details);
  }
  return (await res.json()) as T;
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Your data is safe."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export type PricingSlice = { estimate: EstimateDTO | null; comps: CompDTO[] };
export type ProfileSlice = { item: ItemSummaryDTO; profile: ProfileDTO | null } & PricingSlice;

export const itemApi = {
  summary: (id: string, signal?: AbortSignal) => request<ItemSummary>(`/api/items/${id}/summary`, { signal }),
  detail: (id: string) => request<{ item: ItemDetailDTO }>(`/api/items/${id}`).then((r) => r.item),
  update: (id: string, patch: { title?: string; listPrice?: number | null; conditionGrade?: ConditionGrade | null; floorPrice?: number | null }) =>
    request<{ item: ItemListDTO }>(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.item),
  setStatus: (id: string, status: "ARCHIVED" | "READY" | "DRAFT") => request<{ item: ItemListDTO }>(`/api/items/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }).then((r) => r.item),
  editProfile: (id: string, field: string, value: string) => request<ProfileSlice>(`/api/items/${id}/profile`, { method: "PATCH", body: JSON.stringify({ field, value }) }),
  pickAlternative: (id: string, index: number) => request<ProfileSlice>(`/api/items/${id}/profile`, { method: "PATCH", body: JSON.stringify({ pickAlternative: index }) }),
  reanalyze: (id: string) => request<{ jobId: string; reused: boolean }>(`/api/items/${id}/profile/reanalyze`, { method: "POST" }),
  recalculate: (id: string) => request<PricingSlice>(`/api/items/${id}/estimate/recalculate`, { method: "POST" }),
  setCompIncluded: (id: string, compId: string, included: boolean) => request<PricingSlice>(`/api/items/${id}/comps/${compId}`, { method: "PATCH", body: JSON.stringify({ included }) }),
  drafts: (id: string) => request<{ drafts: ListingDraftDTO[] }>(`/api/items/${id}/drafts`).then((r) => r.drafts),
  saveDraft: (id: string, key: DraftKey, copy: ListingCopy) => request<{ draft: ListingDraftDTO }>(`/api/items/${id}/drafts/${key}`, { method: "PUT", body: JSON.stringify(copy) }).then((r) => r.draft),
  proposeTool: (id: string, key: DraftKey, tool: ListingToolId) => request<ToolProposal>(`/api/items/${id}/drafts/${key}/tool`, { method: "POST", body: JSON.stringify({ tool }) }),
  applyTool: (id: string, key: DraftKey, proposal: ToolProposal) =>
    request<{ draft: ListingDraftDTO }>(`/api/items/${id}/drafts/${key}/tool/apply`, {
      method: "POST",
      body: JSON.stringify({ tool: proposal.tool, proposal: proposal.proposal, selfCheck: proposal.selfCheck as SelfCheck, model: proposal.model, provider: proposal.provider }),
    }).then((r) => r.draft),
  versions: (id: string, key: DraftKey) => request<{ versions: DraftVersionDTO[] }>(`/api/items/${id}/drafts/${key}/versions`).then((r) => r.versions),
  restore: (id: string, key: DraftKey, version: number) => request<{ draft: ListingDraftDTO }>(`/api/items/${id}/drafts/${key}/restore`, { method: "POST", body: JSON.stringify({ version }) }).then((r) => r.draft),
  regenerate: (id: string) => request<{ drafts: ListingDraftDTO[]; selfCheck: SelfCheck; generatedBy: string }>(`/api/items/${id}/drafts/regenerate`, { method: "POST", body: JSON.stringify({}) }),
};
