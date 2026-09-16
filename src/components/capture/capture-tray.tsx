"use client";
import { forwardRef } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Shot } from "./shots";

/**
 * Horizontal strip of captured shots. The last slot is the "landing zone" for the fly-to-tray
 * animation; `endRef` exposes it so the parent can measure where the new thumbnail lands.
 */
export const CaptureTray = forwardRef<
  HTMLDivElement,
  { shots: Shot[]; activeId: string | null; onSelect: (shot: Shot) => void; orientation?: "row" | "grid"; className?: string; endRef?: React.Ref<HTMLDivElement> }
>(function CaptureTray({ shots, activeId, onSelect, orientation = "row", className, endRef }, ref) {
  return (
    <div
      ref={ref}
      role="list"
      aria-label={`${shots.length} ${shots.length === 1 ? "photo" : "photos"} captured`}
      className={cn(orientation === "row" ? "hide-scrollbar flex items-center gap-2 overflow-x-auto" : "grid grid-cols-4 gap-2", className)}
    >
      {shots.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="listitem"
          onClick={() => onSelect(s)}
          aria-label={`Photo ${i + 1}, ${s.label}. Open to retake, move or delete`}
          aria-current={activeId === s.id ? "true" : undefined}
          className={cn(
            "relative shrink-0 overflow-hidden rounded-xs border-2 bg-surface-sunken transition-colors",
            orientation === "row" ? "size-14" : "aspect-square w-full",
            activeId === s.id ? "border-accent" : "border-transparent",
          )}
        >
          {s.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL preview; next/image cannot optimise blobs
            <img src={s.url} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <span className="flex size-full items-center justify-center text-muted">
              <ImageOff className="size-5" aria-hidden />
            </span>
          )}
          <span className="absolute bottom-0.5 left-0.5 rounded-[4px] bg-scrim px-1 text-[10px] font-medium tabular text-primary">{i + 1}</span>
        </button>
      ))}
      <div ref={endRef} aria-hidden className={cn("shrink-0 rounded-xs border border-dashed border-border-default", orientation === "row" ? "size-14" : "aspect-square w-full", shots.length === 0 && orientation === "row" && "hidden")} />
    </div>
  );
});
