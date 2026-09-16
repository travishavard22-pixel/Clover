"use client";

/** Recharts tooltip content styled as a floating surface. Values lead, labels follow. */
export function ChartTooltip({ active, label, rows }: { active?: boolean; label?: React.ReactNode; rows: Array<{ value: string; name: string }> }) {
  if (!active || rows.length === 0) return null;
  return (
    <div role="status" className="rounded-xs border border-border-default bg-surface-floating px-3 py-2 text-sm shadow-float">
      {label !== undefined && label !== null && <div className="mb-1 text-xs text-muted">{label}</div>}
      {rows.map((r) => (
        <div key={r.name} className="flex items-baseline justify-between gap-4">
          <span className="font-semibold tabular text-primary">{r.value}</span>
          <span className="text-xs text-secondary">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

export const AXIS_TICK = { fill: "var(--text-muted)", fontSize: 11 } as const;
export const GRID_STROKE = "var(--border-subtle)";
export const ACCENT = "var(--accent)";
export const SURFACE = "var(--surface-raised)";
