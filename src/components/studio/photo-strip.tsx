"use client";
import type { PhotoDTO } from "@/lib/items/dto";
import { cn } from "@/lib/utils/cn";

/** The item's original photos as a radiogroup of thumbnails. The selected one is the render source. */
export function PhotoStrip({ photos, value, coverId, onChange, className }: { photos: PhotoDTO[]; value: string | null; coverId: string | null; onChange: (id: string) => void; className?: string }) {
  if (photos.length === 0) return null;
  return (
    <section aria-labelledby="studio-sources-title" className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <h2 id="studio-sources-title" className="text-sm font-semibold text-primary">
          Source photo
        </h2>
        <span className="text-xs text-muted">{photos.length === 1 ? "1 photo" : `${photos.length} photos`}</span>
      </div>
      <div role="radiogroup" aria-labelledby="studio-sources-title" className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {photos.map((p, i) => {
          const checked = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${p.label ?? `Photo ${i + 1}`}${p.kind === "ENHANCED" ? " (edited)" : ""}`}
              onClick={() => onChange(p.id)}
              className={cn("relative size-16 shrink-0 overflow-hidden rounded-xs border-2 bg-surface-sunken transition-colors sm:size-20", checked ? "border-accent" : "border-transparent hover:border-border-default")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin file URL */}
              <img src={p.thumbUrl} alt="" className="size-full object-cover" />
              {p.id === coverId && <span className="absolute bottom-1 left-1 rounded-full bg-scrim px-1.5 text-[10px] font-medium text-white">Cover</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
