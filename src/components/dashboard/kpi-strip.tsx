import { formatMoney } from "@/lib/money";
import type { DashboardMetrics } from "@/lib/inventory/metrics";
import { cn } from "@/lib/utils/cn";
import { bucketSeries, Sparkline } from "./sparkline";

type Tile = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  delta?: { text: string; good: boolean | null } | null;
  spark?: number[];
  estimate?: boolean;
};

function deltaText(delta: number | null, fmt: (n: number) => string): Tile["delta"] {
  if (delta === null || delta === 0) return null;
  return { text: `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))} vs prior 30d`, good: delta > 0 };
}

/**
 * The KPI row: six stat tiles. Values use proportional figures at display size; the sparkline is
 * accent-only and the current period is the marked point. "Inventory value" is explicitly an estimate.
 */
export function KpiStrip({ m }: { m: DashboardMetrics }) {
  const last30 = m.series.slice(-30);
  const tiles: Tile[] = [
    { key: "active", label: "Active listings", value: String(m.activeListings), spark: bucketSeries(m.series, 12, (p) => p.listed), sub: `${m.ready} ready · ${m.drafts} draft${m.drafts === 1 ? "" : "s"}` },
    { key: "sold", label: "Sold, 30 days", value: String(m.sold30d), delta: deltaText(m.deltas.sold30d, (n) => String(n)), spark: bucketSeries(last30, 10, (p) => p.sold) },
    { key: "revenue", label: "Revenue, 30 days", value: formatMoney(m.revenue30d, "USD", { compact: true }), delta: deltaText(m.deltas.revenue30d, (n) => formatMoney(n, "USD", { compact: true })), spark: bucketSeries(last30, 10, (p) => p.revenue) },
    { key: "value", label: "Inventory value", value: formatMoney(m.inventoryValueEstimate, "USD", { compact: true }), estimate: true, sub: "Unsold items at estimate or list price" },
    { key: "profit", label: "Realised profit", value: formatMoney(m.realisedProfit, "USD", { compact: true }), sub: m.soldAll ? `${formatMoney(m.realisedProfit30d, "USD", { compact: true })} in the last 30 days` : "After fees, shipping and cost" },
    { key: "days", label: "Avg days to sale", value: m.avgDaysToSale === null ? "—" : m.avgDaysToSale.toFixed(m.avgDaysToSale % 1 ? 1 : 0), sub: m.medianDaysToSale === null ? "No sales yet" : `Median ${m.medianDaysToSale}` },
  ];
  // Container queries rather than viewport ones: this strip renders inside the dashboard's 8-of-12
  // column, where `xl:grid-cols-6` gave each tile about 100px and truncated every label and value.
  // What matters is how wide the column actually is, so six across only happens when there is room.
  return (
    <div className="@container">
      <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @6xl:grid-cols-6" aria-label="Key figures">
        {tiles.map((t) => (
          <li key={t.key} className="surface-card flex min-w-0 flex-col gap-1.5 p-4">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-secondary">
              <span className="truncate">{t.label}</span>
              {t.estimate && <span className="shrink-0 rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">estimate</span>}
            </div>
            <div className="flex items-end justify-between gap-2">
              {/* Exactly one font-size class: cn() concatenates, it does not merge Tailwind classes,
                  so emitting both text-[1.65rem] and text-xl left the arbitrary value winning and
                  long values truncating instead of shrinking. */}
              <span className={cn("display truncate leading-none text-primary", t.value.length > 6 ? "text-xl" : "text-[1.65rem]")}>{t.value}</span>
              {t.spark && t.spark.length > 1 && <Sparkline values={t.spark} width={64} height={24} className="shrink-0 mb-0.5" />}
            </div>
            {t.delta ? (
              <div className={cn("truncate text-xs tabular", t.delta.good ? "text-success" : "text-secondary")}>
                <span aria-hidden>{t.delta.good ? "▲ " : "▼ "}</span>
                {t.delta.text}
              </div>
            ) : (
              <div className="truncate text-xs text-muted">{t.sub ?? " "}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
