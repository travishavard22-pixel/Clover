"use client";
import type { PricingMethod } from "@/lib/pricing/types";
import { formatMoney } from "@/lib/money";

/** The engine trace as a readable table (expert mode). Nothing here is hidden from non-experts, only folded. */
export function MethodTable({ method }: { method: PricingMethod }) {
  const rows: Array<[string, string]> = [
    ["Engine version", method.version],
    ["Comparables source", method.provider === "ebay" ? "eBay Browse API (market evidence)" : method.provider === "demo" ? "Demo catalog (not market evidence)" : "None"],
    ...(method.compsError ? ([["Comparables error", method.compsError]] as Array<[string, string]>) : []),
    ["Search query", method.query ? [method.query.gtin ? `GTIN ${method.query.gtin}` : null, method.query.q, method.query.conditionIds.length ? `conditions ${method.query.conditionIds.join(", ")}` : null].filter(Boolean).join(" · ") : "—"],
    ["Similarity threshold", `${method.similarity.threshold} over tokens: ${method.similarity.targetTokens.join(", ") || "—"}`],
    [
      "Funnel",
      `${method.counts.candidates} candidates → ${method.counts.afterSimilarity} similar → ${method.counts.afterLots} single items → ${method.counts.afterCondition} gradable → ${method.counts.afterIqr} within fences → ${method.counts.included} included (${method.counts.marketEvidence} market evidence, ${method.counts.sold} sold, ${method.counts.userIncluded} force-included, ${method.counts.userExcluded} excluded by you)`,
    ],
    ["IQR fences", method.iqr ? `Q1 ${formatMoney(method.iqr.q1)} · Q3 ${formatMoney(method.iqr.q3)} · keep ${formatMoney(method.iqr.lowFence)}–${formatMoney(method.iqr.highFence)}` : "Not applied (too few comparables)"],
    ["Condition multiplier", `${method.conditionMultipliers.targetGrade.replace("_", " ")} × ${method.conditionMultipliers.targetMultiplier}`],
    ["Time decay", `half-life ${method.timeDecay.halfLifeDays} days · sold listings weighted ×${method.timeDecay.soldBoost} · unknown age counted as ${method.timeDecay.unknownAgeDays} days`],
    ["Ask-to-sold ratio", method.askToSold.applied ? `×${method.askToSold.ratio} (${method.askToSold.reason})` : `Not applied (${method.askToSold.reason})`],
    ["Weighted quantiles", method.weightedQuantiles ? `p25 ${formatMoney(method.weightedQuantiles.p25)} · p50 ${formatMoney(method.weightedQuantiles.p50)} · p75 ${formatMoney(method.weightedQuantiles.p75)}` : "—"],
    ["Bootstrap", method.bootstrap ? `${method.bootstrap.samples} resamples (seed ${method.bootstrap.seed}) → ${formatMoney(method.bootstrap.low)} / ${formatMoney(method.bootstrap.likely)} / ${formatMoney(method.bootstrap.high)}` : "—"],
    ["Effective sample", method.effectiveSample.toFixed(2)],
    ["Fallback prior", method.fallback ? `${method.fallback.source} — median ${formatMoney(method.fallback.medianCents)}` : "Not used"],
    ["Rounding", method.rounding],
    ["Confidence rule", method.confidenceRule],
  ];
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <caption className="sr-only">How the estimate was calculated</caption>
        <tbody className="divide-y divide-border-subtle">
          {rows.map(([k, v]) => (
            <tr key={k} className="align-top">
              <th scope="row" className="w-40 py-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-muted">
                {k}
              </th>
              <td className="py-2 text-primary">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {method.perComp.length > 0 && (
        <div className="overflow-x-auto hide-scrollbar">
          <table className="w-full min-w-[40rem] text-xs">
            <caption className="sr-only">Per-comparable scoring</caption>
            <thead>
              <tr className="text-left uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2 font-medium">Comparable</th>
                <th className="py-1.5 pr-2 text-right font-medium">Similarity</th>
                <th className="py-1.5 pr-2 text-right font-medium">Landed</th>
                <th className="py-1.5 pr-2 text-right font-medium">× Grade</th>
                <th className="py-1.5 pr-2 text-right font-medium">Normalized</th>
                <th className="py-1.5 pr-2 text-right font-medium">Age</th>
                <th className="py-1.5 pr-2 text-right font-medium">Weight</th>
                <th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle tabular">
              {method.perComp.map((c, i) => (
                <tr key={c.id ?? i} className={c.included ? "" : "text-muted"}>
                  <td className="max-w-[16rem] truncate py-1.5 pr-2 text-primary" title={c.title}>
                    {c.title}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{c.similarity.toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-right">{formatMoney(c.landed)}</td>
                  <td className="py-1.5 pr-2 text-right">{c.multiplier !== null ? `×${c.multiplier.toFixed(2)}` : "—"}</td>
                  <td className="py-1.5 pr-2 text-right">{c.normalized !== null ? formatMoney(c.normalized) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right">{c.ageDays !== null ? `${c.ageDays}d` : "?"}</td>
                  <td className="py-1.5 pr-2 text-right">{c.weight !== null ? c.weight.toFixed(2) : "—"}</td>
                  <td className="py-1.5">{c.included ? (c.sold ? "Included · sold" : "Included") : c.exclusionReason ?? "Excluded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
