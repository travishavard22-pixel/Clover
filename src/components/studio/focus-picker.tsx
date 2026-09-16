"use client";
import { useId, useRef } from "react";
import { Crosshair } from "lucide-react";
import { LabelledSlider } from "./labelled-slider";

/**
 * Picks the focus point (0..1) for DETAIL and CONDITION on a thumbnail of the source. Tap or click
 * to place it; the two sliders are the keyboard alternative and also give a numeric readout.
 */
export function FocusPicker({ src, alt, value, onChange, mirrored }: { src: string; alt: string; value: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void; mirrored: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const place = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };
  const shownX = mirrored ? 1 - value.x : value.x;
  return (
    <div className="space-y-3">
      <p id={`${id}-help`} className="text-sm text-secondary">
        Tap the photo where the detail is, or use the sliders.
      </p>
      <button
        ref={ref}
        type="button"
        onClick={place}
        aria-describedby={`${id}-help`}
        aria-label={`Focus point at ${Math.round(value.x * 100)}% across, ${Math.round(value.y * 100)}% down. Activate then use the sliders to move it.`}
        className="relative block w-full cursor-crosshair overflow-hidden rounded-sm border border-border-subtle bg-surface-sunken"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin file URL */}
        <img src={src} alt={alt} className={mirrored ? "block w-full -scale-x-100" : "block w-full"} draggable={false} />
        <span className="pointer-events-none absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-accent/80 text-white shadow-float" style={{ left: `${shownX * 100}%`, top: `${value.y * 100}%` }} aria-hidden>
          <Crosshair className="size-4" />
        </span>
      </button>
      <div className="grid grid-cols-2 gap-3">
        <LabelledSlider label="Across" value={Math.round(value.x * 100)} min={0} max={100} onChange={(x) => onChange({ ...value, x: x / 100 })} format={(v) => `${v}%`} />
        <LabelledSlider label="Down" value={Math.round(value.y * 100)} min={0} max={100} onChange={(y) => onChange({ ...value, y: y / 100 })} format={(v) => `${v}%`} />
      </div>
    </div>
  );
}
