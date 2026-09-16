"use client";
import { forwardRef, useRef } from "react";
import { Check } from "lucide-react";
import { Skeleton } from "@/components/ui/card";
import { STUDIO_MODE_LIST, type ModeSpec, type StudioModeId } from "@/lib/studio/modes";
import { cn } from "@/lib/utils/cn";
import type { ModeThumbs } from "./use-preview";

/**
 * The eight modes as a radiogroup of cards with tiny live previews. Arrow keys move between modes;
 * the selected card's description says exactly what the pipeline will do, including the
 * CONDITION honesty note.
 */
export function ModePicker({ value, onChange, thumbs, segmentationAvailable, className }: { value: StudioModeId; onChange: (m: StudioModeId) => void; thumbs: ModeThumbs; segmentationAvailable: boolean; className?: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = STUDIO_MODE_LIST[(idx + delta + STUDIO_MODE_LIST.length) % STUDIO_MODE_LIST.length]!;
    onChange(next.id);
    refs.current[next.id]?.focus();
  };
  const selected = STUDIO_MODE_LIST.find((m) => m.id === value)!;

  return (
    <div className={cn("space-y-3", className)}>
      <div role="radiogroup" aria-label="Studio mode" className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-2">
        {STUDIO_MODE_LIST.map((m, i) => (
          <ModeCard key={m.id} ref={(el) => void (refs.current[m.id] = el)} spec={m} checked={m.id === value} thumb={thumbs.byMode[m.id]?.dataUrl ?? null} loading={thumbs.status === "loading"} onSelect={() => onChange(m.id)} onKeyDown={(e) => onKey(e, i)} fallback={!segmentationAvailable && m.needsSegmentation} />
        ))}
      </div>
      <div className="rounded-sm border border-border-subtle bg-surface-raised p-3 text-sm" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-medium text-primary">{selected.name}</h3>
          <span className="text-xs text-muted">{selected.output}</span>
        </div>
        <p className="mt-1 text-secondary">{selected.does}</p>
        {selected.honestyNote && <p className="mt-2 text-xs font-medium text-primary">{selected.honestyNote}</p>}
        {!segmentationAvailable && selected.needsSegmentation && <p className="mt-2 text-xs text-warning">No background separation is configured, so this mode runs as enhancement only (levels, white balance, framing) and is labelled that way.</p>}
      </div>
    </div>
  );
}


const ModeCard = forwardRef<HTMLButtonElement, { spec: ModeSpec; checked: boolean; thumb: string | null; loading: boolean; fallback: boolean; onSelect: () => void; onKeyDown: (e: React.KeyboardEvent) => void }>(function ModeCard(
  { spec, checked, thumb, loading, fallback, onSelect, onKeyDown },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative flex w-32 shrink-0 flex-col overflow-hidden rounded-sm border bg-surface-raised text-left transition-colors sm:w-auto",
        checked ? "border-accent" : "border-border-subtle hover:border-border-default",
      )}
      aria-label={`${spec.name}: ${spec.description}${fallback ? " (enhancement only)" : ""}`}
    >
      <div className="relative aspect-[4/3] w-full bg-surface-sunken">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL preview
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : loading ? (
          <Skeleton className="size-full rounded-none" />
        ) : (
          <div className="size-full" style={{ background: spec.autoBackgroundHex }} aria-hidden />
        )}
        {checked && (
          <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-on-accent shadow-float" aria-hidden>
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate text-xs font-medium text-primary">{spec.name}</div>
        <div className="truncate text-[11px] text-muted">{fallback ? "Enhancement only" : spec.keepsBackground ? "Keeps background" : "Replaces background"}</div>
      </div>
    </button>
  );
});
