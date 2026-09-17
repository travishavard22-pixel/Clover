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
    { key: "value", label: "Inventory value", value: formatMoney(m.inventoryValueEstimate, "USD", { compact: true }), estimate: true, sub: "At estimate or list price" },
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
          // Each tile is its own container as well: what a tile can show depends on how wide *it*
          // is, and on a two-column phone grid that is ~106–173px. Sizing off the strip would put
          // the same decisions on a 106px tile and a 250px one.
          <li key={t.key} className="@container surface-card flex min-w-0 flex-col gap-1.5 p-4">
            {/* Wrapping, so the "estimate" pill drops to its own line rather than eating the label
                down to "Inventory v…". `basis-full` is what forces that break: with `truncate` the
                label would give up its own width first and the pill would never wrap. */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs font-medium text-secondary">
              <span className="basis-full truncate @[12rem]:basis-auto">{t.label}</span>
              {t.estimate && <span className="shrink-0 rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">estimate</span>}
            </div>
            <div className="flex items-end justify-between gap-2">
              {/* Exactly one font-size class: cn() concatenates, it does not merge Tailwind classes,
                  so emitting both text-[1.65rem] and text-xl left the arbitrary value winning and
                  long values truncating instead of shrinking. */}
              {/* leading-none goes last: a Tailwind text-<size> also sets a line-height, so cn()
                  now resolves it away if it comes first. */}
              <span className={cn("display truncate text-primary", t.value.length > 6 ? "text-xl" : "text-[1.65rem]", "leading-none")}>{t.value}</span>
              {/* The trend line costs 72px of a tile's width. Below a 12rem tile that is more than
                  half of it and "$469.65" came out as "$46…", so the figure wins and the sparkline
                  waits for a tile wide enough to hold both. It is decoration; the delta line below
                  carries the same direction in words. */}
              {t.spark && t.spark.length > 1 && <Sparkline values={t.spark} width={64} height={24} className="mb-0.5 hidden shrink-0 @[12rem]:block" />}
            </div>
            {/* Two lines rather than an ellipsis: the longest of these lost its last words to a phone
                tile. On a wide tile they all still fit on one line. */}
            {t.delta ? (
              <div className={cn("line-clamp-2 text-xs tabular", t.delta.good ? "text-success" : "text-secondary")}>
                <span aria-hidden>{t.delta.good ? "▲ " : "▼ "}</span>
                {t.delta.text}
              </div>
            ) : (
              <div className="line-clamp-2 text-xs text-muted">{t.sub ?? " "}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
