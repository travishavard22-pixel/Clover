"use client";
import type { ItemStatus } from "@/lib/db";
import type { ItemDetailDTO } from "@/lib/inventory/detail";
import type { BatchInput, BatchResult } from "@/lib/inventory/batch";
import type { ItemUpdate } from "@/lib/inventory/update";
import type { MarkSoldInput } from "@/lib/inventory/rules";
import type { ItemListDTO, ListFilters, ListResult } from "@/lib/inventory/types";
import { filtersToSearchParams } from "@/lib/inventory/filters";

export class InventoryApiError extends Error {
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
    let message = `Request failed (${res.status})`;
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
    throw new InventoryApiError(res.status, message, code, details);
  }
  return (await res.json()) as T;
}

export const inventoryApi = {
  list(filters: ListFilters, signal?: AbortSignal): Promise<ListResult> {
    const sp = filtersToSearchParams(filters);
    return request<ListResult>(`/api/items?${sp.toString()}`, { signal });
  },
  detail(id: string, signal?: AbortSignal): Promise<ItemDetailDTO> {
    return request<{ item: ItemDetailDTO }>(`/api/items/${id}`, { signal }).then((r) => r.item);
  },
  update(id: string, patch: ItemUpdate): Promise<ItemListDTO> {
    return request<{ item: ItemListDTO }>(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.item);
  },
  setStatus(id: string, status: Exclude<ItemStatus, "SOLD" | "ANALYZING">): Promise<ItemListDTO> {
    return request<{ item: ItemListDTO }>(`/api/items/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }).then((r) => r.item);
  },
  markSold(id: string, input: MarkSoldInput): Promise<{ item: ItemListDTO; guarded: Array<{ publicationId: string; marketplace: string; mode: string; action: "user_action" | "queued_end" }> }> {
    return request(`/api/items/${id}/sold`, { method: "POST", body: JSON.stringify(input) });
  },
  remove(id: string): Promise<{ action: "deleted" | "archived"; id: string }> {
    return request(`/api/items/${id}`, { method: "DELETE" });
  },
  batch(input: BatchInput): Promise<BatchResult> {
    return request<BatchResult>(`/api/items/batch`, { method: "POST", body: JSON.stringify(input) });
  },
  async exportCsv(ids: string[]): Promise<Blob> {
    const res = await fetch(`/api/items/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/csv" },
      body: JSON.stringify({ op: "export_csv", ids }),
    });
    if (!res.ok) throw new InventoryApiError(res.status, "Export failed");
    return res.blob();
  },
};

/** Fields the quick-edit sheet lets the seller change, taken from a list row. */
export function editableFields(item: ItemListDTO): Required<Pick<ItemUpdate, "title" | "brand" | "model" | "categoryPath" | "conditionGrade" | "conditionNotes" | "acquisitionCost" | "listPrice" | "floorPrice" | "storageLocation" | "notes" | "quantity" | "acquiredAt" | "sku">> {
  return {
    title: item.title,
    brand: item.brand,
    model: item.model,
    categoryPath: item.categoryPath,
    conditionGrade: item.conditionGrade,
    conditionNotes: item.conditionNotes,
    acquisitionCost: item.acquisitionCost,
    listPrice: item.listPrice,
    floorPrice: item.floorPrice,
    storageLocation: item.storageLocation,
    notes: item.notes,
    quantity: item.quantity,
    acquiredAt: item.acquiredAt ? new Date(item.acquiredAt) : null,
    sku: item.sku,
  };
}

export type EditableFields = ReturnType<typeof editableFields>;

/** Returns only the keys whose value differs (so PATCH bodies stay minimal and audit logs honest). */
export function diffFields(before: EditableFields, after: EditableFields): ItemUpdate {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as Array<keyof EditableFields>) {
    const a = after[key];
    const b = before[key];
    const same = a instanceof Date || b instanceof Date ? (a instanceof Date ? a.getTime() : a) === (b instanceof Date ? b.getTime() : b) : Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
    if (!same) out[key] = a;
  }
  return out as ItemUpdate;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
