"use client";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardMetrics } from "@/lib/inventory/metrics";
import { histogramDays, STATUS_ORDER } from "@/lib/inventory/compute";
import { ITEM_STATUS_META } from "@/lib/items/status";
import { MARKETPLACES } from "@/lib/marketplaces/registry";
import { formatMoney, pct } from "@/lib/money";
import { ChartFrame } from "./chart-frame";
import { ACCENT, AXIS_TICK, ChartTooltip, GRID_STROKE, SURFACE } from "./chart-tooltip";

type Realisation = Array<{ id: string; title: string; soldPrice: number; estimate: number; basis: string; marketplace: string | null }>;

const money = (c: number) => formatMoney(c, "USD", { compact: true });
const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function InsightsView({ metrics, realisation }: { metrics: DashboardMetrics; realisation: Realisation }) {
  const weekly = useMemo(() => bucketWeeks(metrics.series), [metrics.series]);
  const totalRevenue90 = metrics.series.reduce((s, p) => s + p.revenue, 0);
  const bestShare = metrics.bestByRevenue && metrics.revenueAll ? pct(metrics.bestByRevenue.revenue, metrics.revenueAll) : 0;
  const hist = histogramDays(metrics.daysToSale);
  const statuses = STATUS_ORDER.map((s) => ({ status: s, label: ITEM_STATUS_META[s].label, count: metrics.statusBreakdown.find((b) => b.status === s)?.count ?? 0 })).filter((s) => s.count > 0);
  const marketplaces = [...metrics.marketplaces].sort((a, b) => b.revenue - a.revenue || b.sold - a.sold);
  const scatterMax = Math.max(1, ...realisation.flatMap((r) => [r.soldPrice, r.estimate]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartFrame
        title="Revenue over time"
        className="lg:col-span-2"
        caption={
          metrics.soldAll === 0
            ? "Sales will chart here as items sell."
            : `You sold ${metrics.sold30d} item${metrics.sold30d === 1 ? "" : "s"} in the last 30 days for ${money(metrics.revenue30d)}; ${money(totalRevenue90)} over 90 days${metrics.bestByRevenue ? `, ${bestShare}% of it on ${MARKETPLACES[metrics.bestByRevenue.marketplace].shortName}` : ""}.`
        }
        empty={metrics.soldAll === 0 ? "No sales yet. Publish a listing and this chart fills in week by week." : null}
        table={{ caption: "Weekly revenue for the last 90 days", columns: ["Week starting", "Revenue", "Items sold", "Items listed"], rows: weekly.map((w) => [w.date, formatMoney(w.revenue), w.sold, w.listed]) }}
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={(v: number) => money(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof weekly)[number] | undefined;
                return <ChartTooltip active={active} label={p ? `Week of ${shortDate(p.date)}` : undefined} rows={p ? [{ value: formatMoney(p.revenue), name: "revenue" }, { value: String(p.sold), name: "sold" }, { value: String(p.listed), name: "listed" }] : []} />;
              }}
            />
            <Area type="linear" dataKey="revenue" stroke={ACCENT} strokeWidth={2} fill={ACCENT} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2, fill: ACCENT }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Sell-through by marketplace"
        caption={metrics.bestBySellThrough ? `${MARKETPLACES[metrics.bestBySellThrough.marketplace].shortName} converts best: ${Math.round(metrics.bestBySellThrough.sellThrough * 100)}% of what you listed there has sold.` : "Sell-through is sold ÷ (sold + still active) per marketplace."}
        empty={marketplaces.length === 0 ? "Publish to a marketplace to compare where things sell." : null}
        table={{ caption: "Sell-through by marketplace", columns: ["Marketplace", "Sold", "Active", "Sell-through", "Revenue"], rows: marketplaces.map((m) => [MARKETPLACES[m.marketplace].name, m.sold, m.active, `${Math.round(m.sellThrough * 100)}%`, formatMoney(m.revenue)]) }}
      >
        <ResponsiveContainer width="100%" height={Math.max(160, marketplaces.length * 44)}>
          <BarChart data={marketplaces.map((m) => ({ ...m, name: MARKETPLACES[m.marketplace].shortName, pct: Math.round(m.sellThrough * 100) }))} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap={12}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={72} />
            <Tooltip
              cursor={{ fill: "var(--surface-sunken)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { name: string; pct: number; sold: number; active: number; revenue: number } | undefined;
                return <ChartTooltip active={active} label={p?.name} rows={p ? [{ value: `${p.pct}%`, name: "sell-through" }, { value: `${p.sold} sold · ${p.active} active`, name: "" }, { value: formatMoney(p.revenue), name: "revenue" }] : []} />;
              }}
            />
            <Bar dataKey="pct" fill={ACCENT} radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false} label={{ position: "right", fill: "var(--text-secondary)", fontSize: 11, formatter: (v: unknown) => `${String(v)}%` }} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Days to sale"
        caption={metrics.medianDaysToSale !== null ? `Half of your sold items went within ${metrics.medianDaysToSale} day${metrics.medianDaysToSale === 1 ? "" : "s"} of listing (average ${metrics.avgDaysToSale}).` : "How long listed items take to sell."}
        empty={metrics.daysToSale.length === 0 ? "Needs at least one sale with a listing date." : null}
        table={{ caption: "Days from listing to sale", columns: ["Days", "Items"], rows: hist.map((h) => [h.label, h.count]) }}
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={8}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={28} />
            <Tooltip cursor={{ fill: "var(--surface-sunken)" }} content={({ active, payload }) => <ChartTooltip active={active} label={payload?.[0]?.payload?.label ? `${payload[0].payload.label} days` : undefined} rows={payload?.[0] ? [{ value: String(payload[0].value), name: "items" }] : []} />} />
            <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} barSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Inventory by status"
        caption={`${metrics.totalItems} item${metrics.totalItems === 1 ? "" : "s"} in total; ${metrics.activeListings} live, ${metrics.ready} ready to publish, ${metrics.drafts} draft${metrics.drafts === 1 ? "" : "s"}.`}
        empty={statuses.length === 0 ? "Scan your first item to start an inventory." : null}
        table={{ caption: "Items by status", columns: ["Status", "Items"], rows: statuses.map((s) => [s.label, s.count]) }}
      >
        <ResponsiveContainer width="100%" height={Math.max(160, statuses.length * 36)}>
          <BarChart data={statuses} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
            <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={96} />
            <Tooltip cursor={{ fill: "var(--surface-sunken)" }} content={({ active, payload }) => <ChartTooltip active={active} label={payload?.[0]?.payload?.label} rows={payload?.[0] ? [{ value: String(payload[0].value), name: "items" }] : []} />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} label={{ position: "right", fill: "var(--text-secondary)", fontSize: 11 }}>
              {statuses.map((s) => (
                <Cell key={s.status} fill={s.status === "LISTED" || s.status === "OFFER_RECEIVED" ? ACCENT : "var(--border-strong)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Sold price vs estimate"
        className="lg:col-span-2"
        caption={realisation.length ? `On average your items sold for ${Math.round((realisation.reduce((s, r) => s + r.soldPrice / r.estimate, 0) / realisation.length) * 100)}% of the recommended price. Points on the line sold exactly at the estimate.` : "Compares what each item sold for with the price Clover recommended."}
        empty={realisation.length === 0 ? "Sell an analyzed item and it appears here." : null}
        table={{ caption: "Sold price versus recommended price", columns: ["Item", "Estimate", "Sold for", "Marketplace"], rows: realisation.map((r) => [r.title, formatMoney(r.estimate), formatMoney(r.soldPrice), r.marketplace ?? "—"]) }}
      >
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke={GRID_STROKE} />
            <XAxis type="number" dataKey="estimate" name="estimate" domain={[0, scatterMax]} tickFormatter={(v: number) => money(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} label={{ value: "Recommended", position: "insideBottomRight", fill: "var(--text-muted)", fontSize: 11, dy: 10 }} />
            <YAxis type="number" dataKey="soldPrice" name="sold" domain={[0, scatterMax]} tickFormatter={(v: number) => money(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} label={{ value: "Sold for", angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 11 }} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: scatterMax, y: scatterMax }]} stroke="var(--border-strong)" strokeDasharray="0" />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Realisation[number] | undefined;
                return <ChartTooltip active={active} label={p?.title} rows={p ? [{ value: formatMoney(p.soldPrice), name: "sold for" }, { value: formatMoney(p.estimate), name: p.basis === "MARKET_EVIDENCE" ? "recommended (market evidence)" : "recommended (AI estimate)" }] : []} />;
              }}
            />
            <Scatter data={realisation} fill={ACCENT} stroke={SURFACE} strokeWidth={2} isAnimationActive={false} shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={6} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

function bucketWeeks(series: DashboardMetrics["series"]) {
  const out: Array<{ date: string; revenue: number; sold: number; listed: number }> = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    out.push({ date: chunk[0]!.date, revenue: chunk.reduce((s, p) => s + p.revenue, 0), sold: chunk.reduce((s, p) => s + p.sold, 0), listed: chunk.reduce((s, p) => s + p.listed, 0) });
  }
  return out;
}
