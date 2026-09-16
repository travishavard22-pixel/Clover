import { cn } from "@/lib/utils/cn";

/**
 * Accent-only sparkline. Pure SVG, renders on the server. The last point is marked so the current
 * value reads at a glance. Decorative: the figure beside it carries the number.
 */
export function Sparkline({ values, className, width = 96, height = 28 }: { values: number[]; className?: string; width?: number; height?: number }) {
  if (values.length < 2) return <span className={cn("inline-block", className)} style={{ width, height }} aria-hidden />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * stepX, pad + (1 - (v - min) / range) * (height - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  const flat = max === min;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0 overflow-visible", className)} aria-hidden focusable="false">
      <path d={d} fill="none" stroke={flat ? "var(--border-strong)" : "var(--accent)"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={flat ? "var(--border-strong)" : "var(--accent)"} stroke="var(--surface-raised)" strokeWidth={2} />
    </svg>
  );
}

/** Sum a daily series into `buckets` equal windows, oldest first (used for sparklines and weekly charts). */
export function bucketSeries<T>(series: T[], buckets: number, pick: (p: T) => number): number[] {
  if (series.length === 0) return [];
  const size = Math.ceil(series.length / buckets);
  const out: number[] = [];
  for (let i = 0; i < series.length; i += size) out.push(series.slice(i, i + size).reduce((s, p) => s + pick(p), 0));
  return out;
}
