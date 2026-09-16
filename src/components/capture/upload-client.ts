"use client";
import type { PhotoDTO } from "@/lib/items/dto";

/**
 * Browser-side client for the item + photo routes. Uses XMLHttpRequest for uploads because fetch
 * has no upload progress. Every error surfaces as an `UploadError` with the server's message so
 * the UI can show exactly what happened and offer a retry.
 */

export class UploadError extends Error {
  constructor(message: string, public status: number, public code = "error") {
    super(message);
    this.name = "UploadError";
  }
}

type ApiErrorBody = { error?: { code?: string; message?: string } };

async function readError(res: Response): Promise<UploadError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {}
  return new UploadError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body?.error?.code);
}

export async function createItem(input: { title?: string } = {}): Promise<{ id: string; sku: string; status: string; title: string }> {
  const res = await fetch("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as { item: { id: string; sku: string; status: string; title: string } };
  return data.item;
}

export type UploadOptions = {
  label?: string | null;
  filename?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export function uploadPhoto(itemId: string, blob: Blob, opts: UploadOptions = {}): Promise<PhotoDTO> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob, opts.filename ?? (blob instanceof File ? blob.name : "photo.jpg"));
    if (opts.label) form.append("label", opts.label);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/items/${encodeURIComponent(itemId)}/photos`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) opts.onProgress(Math.min(0.99, e.loaded / e.total));
    };
    xhr.onload = () => {
      const body = (xhr.response ?? null) as ({ photo?: PhotoDTO } & ApiErrorBody) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.photo) {
        opts.onProgress?.(1);
        resolve(body.photo);
      } else {
        reject(new UploadError(body?.error?.message ?? `Upload failed (${xhr.status})`, xhr.status, body?.error?.code));
      }
    };
    xhr.onerror = () => reject(new UploadError("Network error while uploading. Check your connection and try again.", 0, "network"));
    xhr.onabort = () => reject(new UploadError("Upload cancelled", 0, "aborted"));
    if (opts.signal) {
      if (opts.signal.aborted) return xhr.abort();
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

export async function listPhotos(itemId: string): Promise<PhotoDTO[]> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/photos`, { cache: "no-store" });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { photos: PhotoDTO[] }).photos;
}

export async function reorderPhotos(itemId: string, order: string[]): Promise<PhotoDTO[]> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/photos/order`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { photos: PhotoDTO[] }).photos;
}

export async function deletePhoto(itemId: string, photoId: string): Promise<PhotoDTO[]> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { photos: PhotoDTO[] }).photos;
}

export async function relabelPhoto(itemId: string, photoId: string, label: string | null): Promise<PhotoDTO> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/photos/${encodeURIComponent(photoId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { photo: PhotoDTO }).photo;
}

export type TransformBody = { rotate?: 0 | 90 | 180 | 270; crop?: { left: number; top: number; width: number; height: number }; enhance?: boolean; useOriginal?: boolean };

export async function transformPhoto(itemId: string, photoId: string, body: TransformBody): Promise<PhotoDTO> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/photos/${encodeURIComponent(photoId)}/transform`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { photo: PhotoDTO }).photo;
}

export async function startAnalysis(itemId: string): Promise<{ jobId: string; reused: boolean }> {
  const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/analyze`, { method: "POST" });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as { jobId: string; reused: boolean };
}

/** One file in a batch upload with its live state. */
export type BatchEntry = { id: string; blob: Blob; filename: string; label?: string | null };
export type BatchStatus = "queued" | "uploading" | "done" | "failed";
export type BatchProgress = { id: string; status: BatchStatus; progress: number; error?: string; photo?: PhotoDTO };

/**
 * Uploads a batch with limited concurrency, then fixes the order server-side so photos land in the
 * sequence the seller chose regardless of which request finished first. Failed entries are
 * reported, never silently dropped; the caller can retry them individually.
 */
export async function uploadBatch(
  itemId: string,
  entries: BatchEntry[],
  opts: { concurrency?: number; onUpdate?: (p: BatchProgress) => void; signal?: AbortSignal; existingOrder?: string[] } = {},
): Promise<{ photos: PhotoDTO[]; failures: Array<{ id: string; error: string }> }> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 6));
  const results = new Map<string, PhotoDTO>();
  const failures: Array<{ id: string; error: string }> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++]!;
      if (opts.signal?.aborted) {
        failures.push({ id: entry.id, error: "Cancelled" });
        opts.onUpdate?.({ id: entry.id, status: "failed", progress: 0, error: "Cancelled" });
        continue;
      }
      opts.onUpdate?.({ id: entry.id, status: "uploading", progress: 0 });
      try {
        const photo = await uploadPhoto(itemId, entry.blob, {
          label: entry.label,
          filename: entry.filename,
          signal: opts.signal,
          onProgress: (f) => opts.onUpdate?.({ id: entry.id, status: "uploading", progress: f }),
        });
        results.set(entry.id, photo);
        opts.onUpdate?.({ id: entry.id, status: "done", progress: 1, photo });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        failures.push({ id: entry.id, error: message });
        opts.onUpdate?.({ id: entry.id, status: "failed", progress: 0, error: message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));

  const uploadedInOrder = entries.map((e) => results.get(e.id)).filter((p): p is PhotoDTO => !!p);
  if (uploadedInOrder.length > 1 || (opts.existingOrder && opts.existingOrder.length)) {
    const order = [...(opts.existingOrder ?? []), ...uploadedInOrder.map((p) => p.id)];
    try {
      const photos = await reorderPhotos(itemId, order);
      return { photos, failures };
    } catch {
      // Ordering is cosmetic; the photos are safe. The review step lets the seller reorder by hand.
    }
  }
  return { photos: uploadedInOrder, failures };
}
