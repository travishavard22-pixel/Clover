import { Page, PageHeader } from "@/components/layout/page-header";
import { DemoBadge } from "@/components/ui/badge";
import { getMetrics, getPriceRealisation } from "@/lib/inventory";
import { publicCapabilities } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { InsightsView } from "@/components/insights/insights-view";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const user = await requireUser();
  const [metrics, realisation] = await Promise.all([getMetrics(user.id), getPriceRealisation(user.id)]);
  const caps = publicCapabilities();
  return (
    <Page>
      <PageHeader
        title="Insights"
        description="What sold, where, how fast, and how close your prices landed. Estimates are labelled."
        actions={caps.demoMode || !caps.ai ? <DemoBadge /> : null}
      />
      <InsightsView metrics={metrics} realisation={realisation} />
    </Page>
  );
}
