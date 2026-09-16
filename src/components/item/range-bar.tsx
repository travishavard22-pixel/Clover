"use client";
import { Money } from "@/components/ui/money";
import { formatMoney } from "@/lib/money";

/** Low–likely–high band with the selected price marked. Numbers are always shown as text too. */
export function RangeBar({ low, likely, high, selected }: { low: number; likely: number; high: number; selected: number | null }) {
  const span = Math.max(1, high - low);
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - low) / span) * 100))}%`;
  const label = `Range ${formatMoney(low)} to ${formatMoney(high)}, most likely ${formatMoney(likely)}${selected !== null ? `, your price ${formatMoney(selected)}` : ""}`;
  return (
    <figure aria-label={label} className="space-y-1.5">
      <div className="relative h-2 rounded-full bg-surface-sunken" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-accent-soft-strong" style={{ left: pct(low), right: `calc(100% - ${pct(high)})` }} />
        <div className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: pct(likely) }} />
        {selected !== null && <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface-raised shadow-float" style={{ left: pct(selected) }} />}
      </div>
      <figcaption className="flex justify-between text-xs text-secondary">
        <span>
          Low <Money cents={low} className="text-primary" />
        </span>
        <span>
          Likely <Money cents={likely} className="font-medium text-primary" />
        </span>
        <span>
          High <Money cents={high} className="text-primary" />
        </span>
      </figcaption>
    </figure>
  );
}
