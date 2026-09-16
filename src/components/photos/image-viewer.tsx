"use client";
/**
 * <ImageViewer photos={PhotoDTO[]} index={number} open onClose onIndexChange? />
 *
 * Stable contract used by other features (item detail, studio, listings):
 *   photos         PhotoDTO[] — the item's photos. Pass the complete list from
 *                  GET /api/items/[id]/photos; the viewer browses `visiblePhotos(photos)` (superseded
 *                  edit sources are hidden but still used for the "Original" toggle and compare mode).
 *                  Passing an already-visible list works the same.
 *   index          number — position in the visible sequence to show.
 *   open           boolean — controlled.
 *   onClose        () => void
 *   onIndexChange  (index: number) => void — optional; called on swipe / arrow / thumbnail navigation.
 *
 * Fullscreen Radix Dialog with pinch / wheel zoom and pan, swipe and arrow-key navigation, a
 * thumbnail strip, an "Original / Generated" (or "Edited") toggle when the photo has a source,
 * a before / after compare mode, download, and a caption that labels AI backgrounds honestly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Columns2, Download, Minus, Plus, X } from "lucide-react";
import { darkScope } from "@/components/capture/dark-scope";
import { Button, buttonClasses } from "@/components/ui/button";
import { Segmented } from "@/components/ui/select";
import type { PhotoDTO } from "@/lib/items/dto";
import { visiblePhotos } from "@/lib/photos/order";
import { cn } from "@/lib/utils/cn";
import { CompareSlider } from "./compare-slider";
import { PhotoBadge } from "./photo-badge";
import { useZoomPan } from "./use-zoom-pan";

type Layer = "original" | "generated";

export function ImageViewer({ photos, index, open, onClose, onIndexChange }: { photos: PhotoDTO[]; index: number; open: boolean; onClose: () => void; onIndexChange?: (index: number) => void }) {
  const visible = useMemo(() => visiblePhotos(photos), [photos]);
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const [internal, setInternal] = useState(index);
  const current = Math.max(0, Math.min(visible.length - 1, onIndexChange ? index : internal));
  const photo = visible[current] ?? null;
  const source = photo?.sourcePhotoId ? (byId.get(photo.sourcePhotoId) ?? null) : null;
  const [layer, setLayer] = useState<Layer>("generated");
  const [compare, setCompare] = useState(false);
  const reduce = useReducedMotion();
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) setInternal(index);
  }, [open, index]);
  useEffect(() => {
    setLayer("generated");
    setCompare(false);
  }, [photo?.id]);

  const go = useCallback(
    (next: number) => {
      if (!visible.length) return;
      const clamped = (next + visible.length) % visible.length;
      if (onIndexChange) onIndexChange(clamped);
      else setInternal(clamped);
    },
    [onIndexChange, visible.length],
  );

  const zoom = useZoomPan({ onSwipe: (dir) => go(current + dir), enabled: !compare });
  const { reset } = zoom;
  useEffect(() => reset(), [photo?.id, layer, reset]);

  // Preload neighbours so swiping feels instant.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    for (const n of [current - 1, current + 1]) {
      const p = visible[(n + visible.length) % visible.length];
      if (p) new Image().src = p.url;
    }
  }, [open, current, visible]);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: reduce ? "auto" : "smooth" });
  }, [current, reduce]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        return go(current - 1);
      case "ArrowRight":
        e.preventDefault();
        return go(current + 1);
      case "Home":
        e.preventDefault();
        return go(0);
      case "End":
        e.preventDefault();
        return go(visible.length - 1);
      case "+":
      case "=":
        e.preventDefault();
        return zoom.zoomIn();
      case "-":
        e.preventDefault();
        return zoom.zoomOut();
      case "0":
        e.preventDefault();
        return zoom.reset();
      default:
        return;
    }
  };

  if (!photo) return null;
  const generatedLabel = photo.aiGenerated ? "Generated" : photo.kind === "STUDIO" ? "Studio" : "Edited";
  const shown = layer === "original" && source ? source : photo;
  const alt = photo.label ? `Photo ${current + 1}: ${photo.label}` : `Photo ${current + 1} of ${visible.length}`;
  const filename = `clover-photo-${current + 1}${photo.label ? `-${photo.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}.jpg`;

  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[oklch(0.1_0.008_120/0.94)] animate-fade-in" />
        <D.Content
          style={darkScope}
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col text-primary outline-none"
        >
          <D.Title className="sr-only">Photo viewer</D.Title>
          <div className="sr-only" aria-live="polite">
            {alt}
            {shown !== photo ? ", showing the original" : ""}
          </div>

          {/* Top bar */}
          <div className="flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4">
            <D.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close viewer">
                <X className="size-5" />
              </Button>
            </D.Close>
            <div className="min-w-0 flex-1 text-center text-sm">
              <span className="tabular text-secondary">
                {current + 1} / {visible.length}
              </span>
              {photo.label && <span className="ml-2 truncate font-medium text-primary">{photo.label}</span>}
            </div>
            <div className="flex items-center gap-1">
              {source && (
                <>
                  <Segmented
                    size="sm"
                    aria-label="Which version to show"
                    value={compare ? "compare" : layer}
                    onChange={(v) => {
                      if (v === "compare") setCompare(true);
                      else {
                        setCompare(false);
                        setLayer(v);
                      }
                    }}
                    options={[
                      { value: "original", label: "Original" },
                      { value: "generated", label: generatedLabel },
                      {
                        value: "compare",
                        label: (
                          <span className="inline-flex items-center gap-1">
                            <Columns2 className="size-3.5" aria-hidden /> Compare
                          </span>
                        ),
                      },
                    ]}
                  />
                </>
              )}
              <div className="hidden items-center sm:flex">
                <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={zoom.zoomOut} disabled={compare}>
                  <Minus className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={zoom.zoomIn} disabled={compare}>
                  <Plus className="size-4" />
                </Button>
              </div>
              <a href={shown.url} download={filename} className={buttonClasses("ghost", "icon")} aria-label="Download this photo">
                <Download className="size-5" />
              </a>
            </div>
          </div>

          {/* Stage */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {visible.length > 1 && (
              <>
                <Button variant="ghost" size="icon" aria-label="Previous photo" onClick={() => go(current - 1)} className="absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-scrim text-white sm:flex">
                  <ChevronLeft className="size-5" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Next photo" onClick={() => go(current + 1)} className="absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-scrim text-white sm:flex">
                  <ChevronRight className="size-5" />
                </Button>
              </>
            )}
            {compare && source ? (
              <div className="flex size-full items-center justify-center p-3 sm:p-6">
                <CompareSlider before={source.url} after={photo.url} beforeLabel="Original" afterLabel={generatedLabel} alt={alt} className="max-h-full w-full max-w-5xl" aspect={photo.width / photo.height} />
              </div>
            ) : (
              <div ref={zoom.containerRef} className="relative size-full overflow-hidden" {...zoom.handlers}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={shown.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0.08 : 0.16 }} className="absolute inset-0 flex items-center justify-center p-2 sm:p-6">
                    <div style={zoom.style} className="flex max-h-full max-w-full items-center justify-center will-change-transform">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
                      <img src={shown.url} alt={alt} width={shown.width} height={shown.height} className="max-h-[calc(100dvh-14rem)] max-w-full select-none object-contain" draggable={false} />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Caption + thumbnails */}
          <div className="shrink-0 px-3 pb-3 pt-2 safe-bottom sm:px-4">
            <div className="mb-2 flex min-h-6 items-center justify-center gap-2 text-xs text-secondary">
              <PhotoBadge photo={shown} />
              {shown.aiGenerated && <span>The item pixels are untouched; only the background was generated.</span>}
              {!shown.aiGenerated && shown.kind === "ENHANCED" && <span>Rotated, cropped or enhanced from an original you can switch back to.</span>}
              {shown.kind === "ORIGINAL" && (
                <span className="tabular">
                  {shown.width} × {shown.height}
                </span>
              )}
              {zoom.zoomed && !compare && (
                <button type="button" onClick={zoom.reset} className="rounded-full border border-border-default px-2 py-0.5 text-xs text-primary hover:bg-surface-sunken">
                  Reset zoom ({Math.round(zoom.scale * 100)}%)
                </button>
              )}
            </div>
            {visible.length > 1 && (
              <div ref={stripRef} role="list" aria-label="All photos" className="hide-scrollbar flex justify-start gap-1.5 overflow-x-auto sm:justify-center">
                {visible.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    role="listitem"
                    data-index={i}
                    onClick={() => go(i)}
                    aria-label={`Show photo ${i + 1}${p.label ? `, ${p.label}` : ""}`}
                    aria-current={i === current ? "true" : undefined}
                    className={cn("relative size-14 shrink-0 overflow-hidden rounded-xs border-2 transition-[border-color,opacity]", i === current ? "border-accent" : "border-transparent opacity-70 hover:opacity-100")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
                    <img src={p.thumbUrl} alt="" className="size-full object-cover" draggable={false} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
