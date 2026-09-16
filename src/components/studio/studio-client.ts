"use client";
import type { PhotoDTO } from "@/lib/items/dto";
import type { StudioModeId } from "@/lib/studio/modes";
import type { StudioOptions, StudioOptionsInput } from "@/lib/studio/options";
import type { ProvenanceSummary } from "@/lib/studio/provenance";

/** Browser-side client for the studio routes. Every failure surfaces the server's message so the UI can show exactly what happened. */

export class StudioApiError extends Error {
  constructor(message: string, public status: number, public code = "error") {
    super(message);
    this.name = "StudioApiError";
  }
}

type ApiErrorBody = { error?: { code?: string; message?: string } };

export type SegmentationInfo = { available: boolean; provider: string; reason: string | null };
export type RendersResponse = { photos: PhotoDTO[]; provenance: Record<string, ProvenanceSummary>; segmentation?: SegmentationInfo };
export type StudioPreview = { mode: StudioModeId; dataUrl: string; label: string; path: string; width: number; height: number; notes: string[] };

async function request<T>(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {}
    throw new StudioApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body?.error?.code);
  }
  return (await res.json()) as T;
}

const base = (itemId: string) => `/api/items/${encodeURIComponent(itemId)}/studio`;

export function fetchRenders(itemId: string): Promise<RendersResponse> {
  return request(`${base(itemId)}/renders`);
}

export function startRender(itemId: string, input: { photoId: string; mode: StudioModeId; options?: StudioOptionsInput }): Promise<{ jobId: string; reused: boolean }> {
  return request(`${base(itemId)}/render`, { method: "POST", body: JSON.stringify({ ...input, initiatedBy: "user" }) });
}

export function fetchPreview(itemId: string, input: { photoId: string; mode?: StudioModeId; modes?: StudioModeId[]; options?: StudioOptions; size?: number }, signal?: AbortSignal): Promise<{ previews: StudioPreview[]; dataUrl: string }> {
  return request(`${base(itemId)}/preview`, { method: "POST", body: JSON.stringify(input), signal });
}

export function restoreOriginal(itemId: string, photoId: string, discard = false): Promise<RendersResponse & { sourceId: string }> {
  return request(`${base(itemId)}/${encodeURIComponent(photoId)}/use-original`, { method: "POST", body: JSON.stringify({ discard }) });
}

export function deleteRender(itemId: string, photoId: string): Promise<RendersResponse> {
  return request(`${base(itemId)}/${encodeURIComponent(photoId)}`, { method: "DELETE" });
}

/** Reorders the visible gallery through the photo routes (owned by the photos module). */
export function reorderGallery(itemId: string, order: string[]): Promise<{ photos: PhotoDTO[] }> {
  return request(`/api/items/${encodeURIComponent(itemId)}/photos/order`, { method: "PUT", body: JSON.stringify({ order }) });
}

export function isSourcePhoto(p: Pick<PhotoDTO, "kind">): boolean {
  return p.kind === "ORIGINAL" || p.kind === "ENHANCED";
}

export function isRenderPhoto(p: Pick<PhotoDTO, "kind">): boolean {
  return p.kind === "STUDIO" || p.kind === "CONDITION";
}
