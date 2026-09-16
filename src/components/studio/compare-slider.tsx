"use client";
import { useId, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Before/after comparison: the "after" image is clipped at a draggable divider. The divider is a
 * real range input, so it works with a pointer, a finger and the keyboard (arrows, Home/End) alike.
 */
export function CompareSlider({
  before,
  after,
  beforeLabel = "Original",
  afterLabel = "Studio",
  className,
}: {
  before: { src: string; alt: string };
  after: { src: string; alt: string };
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}) {
  const [pos, setPos] = useState(50);
  const id = useId();
  return (
    <div className={cn("relative size-full select-none", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin file URL */}
      <img src={before.src} alt={before.alt} className="absolute inset-0 size-full object-contain" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin file URL or data URL */}
        <img src={after.src} alt={after.alt} className="absolute inset-0 size-full object-contain" draggable={false} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface-raised shadow-[0_0_0_1px_oklch(0_0_0/0.25)]" style={{ left: `${pos}%` }} aria-hidden>
        <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface-raised text-xs font-medium text-secondary shadow-float">⇄</span>
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-scrim px-2 py-0.5 text-xs font-medium text-white scrim-text" aria-hidden>
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-scrim px-2 py-0.5 text-xs font-medium text-white scrim-text" aria-hidden>
        {afterLabel}
      </span>
      <label htmlFor={id} className="sr-only">
        Comparison divider: percentage of the original shown
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-valuetext={`${pos}% ${beforeLabel}, ${100 - pos}% ${afterLabel}`}
        className="absolute inset-0 m-0 size-full cursor-ew-resize appearance-none bg-transparent opacity-0 focus-visible:opacity-100 focus-visible:[box-shadow:var(--focus-ring)] focus-visible:outline-none"
      />
    </div>
  );
}
