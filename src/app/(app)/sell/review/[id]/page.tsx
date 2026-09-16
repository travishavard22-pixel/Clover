import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Page, PageHeader } from "@/components/layout/page-header";
import { PhotoReview } from "@/components/photos/photo-review";
import { db } from "@/lib/db";
import { toPhotoDTO } from "@/lib/items/dto";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Review photos" };

export default async function ReviewPhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const item = await db.item.findFirst({
    where: { id, userId: user.id },
    include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }, jobs: { where: { type: "ANALYZE_ITEM", status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } },
  });
  if (!item) notFound();
  const activeJob = item.jobs[0];

  return (
    <Page>
      <PageHeader eyebrow="Step 2 of 3" title="Review photos" description="Put the best shot first — it becomes the cover. Rotate, crop or enhance anything that needs it; the originals are always kept." />
      {activeJob && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-info/30 bg-info-soft px-4 py-3 text-sm text-primary" role="status">
          <span>This item is being analyzed right now. Photo edits are saved, but the running analysis uses the photos it started with.</span>
          <Link href={`/items/${item.id}/analyzing?job=${activeJob.id}`} className="inline-flex items-center gap-1 font-medium text-accent-text">
            View progress <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
      <PhotoReview itemId={item.id} initialPhotos={item.photos.map((p) => toPhotoDTO(p))} itemTitle={item.title} sku={item.sku} />
    </Page>
  );
}
