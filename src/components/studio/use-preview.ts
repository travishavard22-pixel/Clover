"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StudioModeId } from "@/lib/studio/modes";
import type { StudioOptions } from "@/lib/studio/options";
import { fetchPreview, StudioApiError, type StudioPreview } from "./studio-client";

export type PreviewState = { status: "idle" | "loading" | "ready" | "error"; preview: StudioPreview | null; error: string | null };

const DEBOUNCE_MS = 320;

type Settled = { key: string; preview: StudioPreview | null; error: string | null };

/**
 * Debounced live preview for the canvas. Every change to the source, mode or options schedules one
 * request; in-flight requests are aborted so a fast slider drag never shows a stale frame. Status is
 * derived by comparing the current request key with the key of the last settled response, so the
 * hook never has to set state synchronously inside an effect.
 */
export function useLivePreview(itemId: string, photoId: string | null, mode: StudioModeId, options: StudioOptions, enabled = true): PreviewState {
  const optionsKey = useMemo(() => JSON.stringify(options), [options]);
  const key = `${photoId ?? ""}|${mode}|${optionsKey}`;
  const [settled, setSettled] = useState<Settled | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !photoId) return;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchPreview(itemId, { photoId, mode, options: JSON.parse(optionsKey) as StudioOptions, size: 640 }, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) setSettled({ key, preview: res.previews[0] ?? null, error: null });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setSettled((s) => ({ key, preview: s?.preview ?? null, error: err instanceof StudioApiError ? err.message : "Preview unavailable — the render itself is unaffected." }));
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [itemId, photoId, mode, optionsKey, enabled, key]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!enabled || !photoId) return { status: "idle", preview: settled?.preview ?? null, error: null };
  if (settled?.key === key) return { status: settled.error ? "error" : "ready", preview: settled.preview, error: settled.error };
  // Keep showing the last frame while the next one renders.
  return { status: "loading", preview: settled?.preview ?? null, error: null };
}

export type ModeThumbs = { status: "loading" | "ready" | "error"; byMode: Partial<Record<StudioModeId, StudioPreview>>; error: string | null };

type ThumbEntry = { byMode: ModeThumbs["byMode"]; error: string | null };

/** Session cache of mode thumbnails keyed by item, photo, modes and size. Small and bounded. */
const thumbCache = new Map<string, ThumbEntry>();
const THUMB_CACHE_MAX = 24;

function remember(key: string, entry: ThumbEntry) {
  if (thumbCache.size >= THUMB_CACHE_MAX) thumbCache.delete(thumbCache.keys().next().value!);
  thumbCache.set(key, entry);
}

/** One batched request per source photo for the mode picker's thumbnails, cached for the session. */
export function useModeThumbnails(itemId: string, photoId: string | null, modes: readonly StudioModeId[], size = 192): ModeThumbs {
  const [, bump] = useState(0);
  const modesKey = modes.join(",");
  const key = `${itemId}:${photoId ?? ""}:${modesKey}:${size}`;

  useEffect(() => {
    if (!photoId || thumbCache.has(key)) return;
    const controller = new AbortController();
    fetchPreview(itemId, { photoId, modes: modesKey.split(",") as StudioModeId[], size }, controller.signal)
      .then((res) => {
        const byMode: ModeThumbs["byMode"] = {};
        for (const p of res.previews) byMode[p.mode] = p;
        remember(key, { byMode, error: null });
        if (!controller.signal.aborted) bump((v) => v + 1);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        remember(key, { byMode: {}, error: err instanceof StudioApiError ? err.message : "Previews unavailable" });
        bump((v) => v + 1);
      });
    return () => controller.abort();
  }, [itemId, photoId, modesKey, size, key]);

  const hit = thumbCache.get(key);
  if (!hit) return { status: "loading", byMode: {}, error: null };
  return { status: hit.error ? "error" : "ready", byMode: hit.byMode, error: hit.error };
}
