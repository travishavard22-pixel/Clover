"use client";
import * as S from "@radix-ui/react-slider";
import { useId } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A labelled Radix slider with a numeric readout. Keyboard-operable (arrows, Home/End, PageUp/Down);
 * the readout is tied to the thumb through aria-valuetext so screen readers hear the unit.
 */
export function LabelledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  hint,
  disabled,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", disabled && "opacity-60", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label id={`${id}-label`} htmlFor={`${id}-thumb`} className="text-sm font-medium text-primary">
          {label}
        </label>
        <output htmlFor={`${id}-thumb`} className="text-sm tabular text-secondary" aria-live="off">
          {format(value)}
        </output>
      </div>
      <S.Root
        className="relative flex h-6 w-full touch-none select-none items-center"
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
      >
        <S.Track className="relative h-1 grow rounded-full bg-border-default">
          <S.Range className="absolute h-full rounded-full bg-accent" />
        </S.Track>
        <S.Thumb
          id={`${id}-thumb`}
          aria-label={label}
          aria-valuetext={format(value)}
          className="block size-5 rounded-full border border-border-strong bg-surface-raised shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-transform duration-(--dur-fast) ease-(--ease-out) hover:scale-105 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
        />
      </S.Root>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
