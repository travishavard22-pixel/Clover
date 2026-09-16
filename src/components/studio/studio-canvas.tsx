"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/card";
import { Segmented } from "@/components/ui/select";
import type { RenderPath } from "@/lib/studio/provenance";
import { cn } from "@/lib/utils/cn";
import { CompareSlider } from "./compare-slider";
import { ProvenanceBadge } from "./provenance-badge";

export type CanvasView = "studio" | "original" | "compare";

export type CanvasImage = {
  src: string;
  alt: string;
  /** "preview" = live 640px preview of the current settings; "render" = a saved photo. */
  kind: "preview" | "render";
  path: RenderPath;
  label: string;
  reason?: string | null;
  notes?: string[];
};

/**
 * The large canvas: the original, the studio version, or both behind a comparison divider. Every
 * studio image carries its honesty badge; a live preview is marked as such so it is never mistaken
 * for a saved photo.
 */
export function StudioCanvas({
  original,
  studio,
  loading,
  error,
  view,
  onViewChange,
  className,
}: {
  original: { src: string; alt: string } | null;
  studio: CanvasImage | null;
  loading: boolean;
  error: string | null;
  view: CanvasView;
  onViewChange: (v: CanvasView) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const canCompare = !!original && !!studio;
  const effective: CanvasView = view === "compare" && !canCompare ? "studio" : view;

  return (
    <section aria-label="Canvas" className={cn("flex flex-col gap-3", className)}>
      <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-studio">
        <div className="relative aspect-[4/3] w-full lg:aspect-auto lg:h-[min(62dvh,760px)]">
          {!original && (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
              <ImageOff className="size-6" aria-hidden />
              <p className="text-sm">Add a photo to the item to use the studio.</p>
            </div>
          )}
          {original && effective === "original" && (
            // eslint-disable-next-line @next/next/no-img-element -- signed same-origin file URL
            <img src={original.src} alt={original.alt} className="absolute inset-0 size-full object-contain" />
          )}
          {original && effective === "compare" && studio && <CompareSlider before={original} after={{ src: studio.src, alt: studio.alt }} afterLabel={studio.kind === "preview" ? "Preview" : "Studio"} />}
          {original && effective === "studio" && (
            <AnimatePresence mode="popLayout" initial={false}>
              {studio ? (
                <motion.img
                  key={studio.src.slice(0, 96) + studio.src.length}
                  src={studio.src}
                  alt={studio.alt}
                  className="absolute inset-0 size-full object-contain"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                />
              ) : (
                <div key="placeholder" className="absolute inset-0">
                  {loading ? (
                    <Skeleton className="size-full rounded-none" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- signed same-origin file URL
                    <img src={original.src} alt={original.alt} className="absolute inset-0 size-full object-contain opacity-60" />
                  )}
                </div>
              )}
            </AnimatePresence>
          )}
          {/* Badges */}
          <div className="pointer-events-auto absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
            {studio && effective !== "original" && <ProvenanceBadge path={studio.path} label={studio.label} reason={studio.reason} className="shadow-float" />}
            {studio?.kind === "preview" && effective !== "original" && (
              <Badge tone="neutral" className="shadow-float">
                Live preview
              </Badge>
            )}
            {studio?.notes?.filter((n) => n && n !== studio.reason).map((n) => (
              <Badge key={n} tone="neutral" className="max-w-full shadow-float">
                <span className="truncate">{n}</span>
              </Badge>
            ))}
          </div>
          {loading && studio && effective === "studio" && (
            <div className="absolute right-3 top-3 rounded-full bg-scrim px-2 py-0.5 text-xs font-medium text-white" role="status">
              Updating preview…
            </div>
          )}
        </div>
        {error && (
          <div className="flex items-start gap-2 border-t border-border-subtle bg-surface-raised px-3 py-2 text-sm text-danger" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          aria-label="Canvas view"
          value={effective}
          onChange={onViewChange}
          size="sm"
          options={[
            { value: "original", label: "Original" },
            { value: "studio", label: "Studio" },
            { value: "compare", label: "Compare" },
          ]}
        />
        <p className="text-xs text-muted" aria-live="polite">
          {studio?.kind === "render" ? "Showing a saved studio photo." : studio ? "Showing a live preview of the current settings." : loading ? "Rendering a preview…" : ""}
        </p>
      </div>
    </section>
  );
}
