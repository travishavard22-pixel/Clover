import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Money } from "@/components/ui/money";
import type { DashboardMetrics } from "@/lib/inventory/metrics";
import { MARKETPLACES } from "@/lib/marketplaces/registry";

/** Compact "where you sell best" card: revenue leader and sell-through leader, with the honest denominator. */
export function BestMarketplaceCard({ m }: { m: DashboardMetrics }) {
  const rev = m.bestByRevenue;
  const st = m.bestBySellThrough;
  return (
    <section className="surface-card p-4" aria-labelledby="best-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="best-heading" className="text-sm font-semibold text-primary">
          Best marketplace
        </h2>
        <Link href="/insights" className="flex items-center gap-1 text-xs text-accent-text underline-offset-4 hover:underline">
          Insights <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
      {!rev ? (
        <p className="mt-3 text-sm text-secondary">Once something sells, you&apos;ll see which marketplace earns the most and sells fastest.</p>
      ) : (
        <>
          <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-xs text-muted">By revenue</dt>
            <dd className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="font-medium text-primary">{MARKETPLACES[rev.marketplace].name}</span>
              <span className="text-sm text-secondary tabular">
                <Money cents={rev.revenue} compact /> · {rev.sold} sold
              </span>
            </dd>
          </div>
          {st && (
            <div>
              <dt className="text-xs text-muted">By sell-through</dt>
              <dd className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="font-medium text-primary">{MARKETPLACES[st.marketplace].name}</span>
                <span className="text-sm text-secondary tabular">
                  {Math.round(st.sellThrough * 100)}% · {st.sold} of {st.sold + st.active}
                </span>
              </dd>
            </div>
          )}
          </dl>
          {m.marketplaces.length > 1 && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <ul className="space-y-1.5">
                {m.marketplaces.slice(0, 4).map((x) => {
                  const share = m.revenueAll ? x.revenue / m.revenueAll : 0;
                  return (
                    <li key={x.marketplace} className="text-xs">
                      <div className="flex items-center justify-between text-secondary">
                        <span>{MARKETPLACES[x.marketplace].shortName}</span>
                        <span className="tabular">{Math.round(share * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-surface-sunken" role="presentation">
                        <div className="h-1 rounded-full bg-accent" style={{ width: `${Math.max(2, share * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
