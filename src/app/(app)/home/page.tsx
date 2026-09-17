import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AttentionFeed } from "@/components/dashboard/attention-feed";
import { BestMarketplaceCard } from "@/components/dashboard/best-marketplace-card";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { RecentItems } from "@/components/dashboard/recent-items";
import { SellCta } from "@/components/dashboard/sell-cta";
import { Page, PageHeader } from "@/components/layout/page-header";
import { DemoBadge } from "@/components/ui/badge";
import { capabilities } from "@/lib/env";
import { getAttention, getMetrics, listItems } from "@/lib/inventory";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

function greeting(name: string, hour: number) {
  const first = name.split(" ")[0] || name;
  const part = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${first}.`;
}

/** Dashboard: "what needs me now" first, then the numbers, then recent work and where to sell next. */
export default async function HomePage() {
  const user = await requireUser();
  const [metrics, attention, recent] = await Promise.all([getMetrics(user.id), getAttention(user.id, { limit: 8 }), listItems(user.id, { limit: 8, sort: "newest" })]);
  const firstTime = metrics.totalItems === 0;
  const needsCount = attention.length;

  return (
    <Page>
      <PageHeader
        serif
        eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={greeting(user.name, new Date().getHours())}
        description={
          firstTime
            ? "Your inventory is empty. The fastest way to start is to photograph something you'd sell."
            : needsCount === 0
              ? "Nothing needs you right now. Here's how things are going."
              : `${needsCount} thing${needsCount === 1 ? "" : "s"} need${needsCount === 1 ? "s" : ""} you, listed first.`
        }
        actions={capabilities.demoMode || !capabilities.ai ? <DemoBadge /> : undefined}
      />

      {firstTime ? (
        <div className="space-y-6">
          <SellCta firstTime />
          <KpiStrip m={metrics} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 space-y-6 lg:col-span-8">
            <section className="surface-card p-4 md:p-5" aria-labelledby="attention-heading">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 id="attention-heading" className="text-base font-semibold text-primary">
                  Needs attention
                </h2>
                {metrics.needsAttention + metrics.pendingOffers + metrics.openRecommendations > attention.length && (
                  <Link href="/offers" className="flex items-center gap-1 text-sm text-accent-text underline-offset-4 hover:underline">
                    See everything <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                )}
              </div>
              <AttentionFeed rows={attention} />
            </section>
            <KpiStrip m={metrics} />
            <RecentItems items={recent.items} />
          </div>
          <div className="min-w-0 space-y-6 lg:col-span-4">
            <SellCta />
            <BestMarketplaceCard m={metrics} />
            <section className="surface-card p-4" aria-labelledby="pulse-heading">
              <h2 id="pulse-heading" className="text-sm font-semibold text-primary">
                Inventory pulse
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-secondary">Pending offers</dt>
                <dd className="text-right tabular text-primary">{metrics.pendingOffers}</dd>
                <dt className="text-secondary">Should reprice</dt>
                <dd className="text-right tabular text-primary">{metrics.shouldReprice}</dd>
                <dt className="text-secondary">Listing problems</dt>
                <dd className="text-right tabular text-primary">{metrics.needsAttention}</dd>
                <dt className="text-secondary">Open suggestions</dt>
                <dd className="text-right tabular text-primary">{metrics.openRecommendations}</dd>
                <dt className="text-secondary">Connections to fix</dt>
                <dd className="text-right tabular text-primary">{metrics.failedConnections}</dd>
                <dt className="text-secondary">Drafts waiting</dt>
                <dd className="text-right tabular text-primary">{metrics.drafts}</dd>
              </dl>
              <p className="mt-3 text-xs text-muted">Should reprice = listed over 14 days with no offers.</p>
            </section>
          </div>
        </div>
      )}
    </Page>
  );
}
