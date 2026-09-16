import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisSequence } from "@/components/analysis/analysis-sequence";
import { StartAnalysisButton } from "@/components/analysis/start-analysis-button";
import { Page, PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { ANALYZE_STEPS } from "@/lib/analysis/steps";
import { db } from "@/lib/db";
import { publicCapabilities } from "@/lib/env";
import { toPhotoDTO } from "@/lib/items/dto";
import type { JobStep } from "@/lib/jobs/types";
import { visiblePhotos } from "@/lib/photos/order";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Analyzing" };

export default async function AnalyzingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ job?: string | string[] }> }) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedJob = typeof query.job === "string" ? query.job : null;

  const item = await db.item.findFirst({ where: { id, userId: user.id }, include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } });
  if (!item) notFound();

  const job =
    (requestedJob ? await db.job.findFirst({ where: { id: requestedJob, itemId: item.id, userId: user.id, type: "ANALYZE_ITEM" } }) : null) ??
    (await db.job.findFirst({ where: { itemId: item.id, userId: user.id, type: "ANALYZE_ITEM" }, orderBy: { createdAt: "desc" } }));

  const visible = visiblePhotos(item.photos);
  const cover = visible[0] ? toPhotoDTO(visible[0]) : null;
  const caps = publicCapabilities();
  const demo = caps.demoMode || !caps.ai;

  if (!job) {
    return (
      <Page width="narrow">
        <PageHeader eyebrow="Step 3 of 3" title="Nothing is being analyzed" description="This item has not been sent for identification and pricing yet." />
        <div className="flex flex-wrap gap-2">
          {visible.length > 0 ? <StartAnalysisButton itemId={item.id} /> : null}
          <Link href={`/sell/review/${item.id}`} className={buttonClasses("outline", "md")}>
            {visible.length > 0 ? "Review photos first" : "Add photos"}
          </Link>
        </div>
      </Page>
    );
  }

  const declared: JobStep[] = Array.isArray(job.steps) && (job.steps as unknown[]).length ? (job.steps as unknown as JobStep[]) : ANALYZE_STEPS.map((s) => ({ ...s, status: "pending" as const }));

  return (
    <Page>
      <PageHeader eyebrow="Step 3 of 3" title={item.title === "Untitled item" ? "Identifying your item" : item.title} description={job.status === "FAILED" ? "The last attempt did not finish." : "Each line below is a real step of the job, updated as it runs."} />
      <AnalysisSequence itemId={item.id} jobId={job.id} initialSteps={declared} initialStatus={job.status} cover={cover} photoCount={visible.length} itemTitle={item.title} demo={demo} />
    </Page>
  );
}
