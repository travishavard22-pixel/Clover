"use client";
import { useCallback, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Before / after comparison with a draggable divider. The divider is a real slider for assistive
 * tech (arrow keys move it, Home / End jump to either side). Both images share one frame so the
 * comparison is pixel-aligned; when the two have different sizes the "after" is letterboxed.
 */
export function CompareSlider({
  before,
  after,
  beforeLabel = "Original",
  afterLabel = "Edited",
  alt,
  className,
  aspect,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  alt: string;
  className?: string;
  /** width / height of the frame; defaults to 4 / 3. */
  aspect?: number;
}) {
  const [position, setPosition] = useState(50);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const id = useId();

  const fromClientX = useCallback((clientX: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setPosition(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const map: Record<string, number | undefined> = { ArrowLeft: position - step, ArrowRight: position + step, ArrowDown: position - step, ArrowUp: position + step, Home: 0, End: 100 };
    const next = map[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setPosition(Math.max(0, Math.min(100, next)));
  };

  return (
    <div
      ref={frameRef}
      className={cn("relative w-full select-none overflow-hidden rounded-sm bg-surface-sunken", className)}
      style={{ aspectRatio: aspect ?? 4 / 3, touchAction: "none" }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        fromClientX(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && fromClientX(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
      <img src={after} alt={`${alt} (${afterLabel.toLowerCase()})`} className="absolute inset-0 size-full object-contain" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
        <img src={before} alt="" className="absolute inset-0 size-full object-contain" draggable={false} />
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-scrim px-2 py-0.5 text-xs font-medium text-white">{beforeLabel}</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-scrim px-2 py-0.5 text-xs font-medium text-white">{afterLabel}</span>
      <div className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_oklch(0_0_0/0.3)]" style={{ left: `${position}%` }} aria-hidden />
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Compare ${beforeLabel.toLowerCase()} and ${afterLabel.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${Math.round(position)}% ${beforeLabel.toLowerCase()}`}
        aria-describedby={`${id}-help`}
        onKeyDown={onKeyDown}
        className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-surface-inverse/20 bg-white text-surface-inverse shadow-float outline-none focus-visible:ring-4 focus-visible:ring-accent/60"
        style={{ left: `${position}%` }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6 3 12l6 6M15 6l6 6-6 6" />
        </svg>
      </div>
      <span id={`${id}-help`} className="sr-only">
        Drag the divider or use the arrow keys. Left of the divider shows the {beforeLabel.toLowerCase()}, right shows the {afterLabel.toLowerCase()}.
      </span>
    </div>
  );
}
