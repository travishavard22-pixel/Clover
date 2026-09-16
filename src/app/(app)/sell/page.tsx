import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Upload } from "lucide-react";
import { DraftCard, type DraftSummary } from "@/components/capture/draft-card";
import { Page, PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { toPhotoDTO } from "@/lib/items/dto";
import { visiblePhotos } from "@/lib/photos/order";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sell" };

async function loadDrafts(userId: string): Promise<DraftSummary[]> {
  const items = await db.item.findMany({
    where: { userId, status: { in: ["DRAFT", "ANALYZING"] } },
    orderBy: { updatedAt: "desc" },
    take: 12,
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      jobs: { where: { type: "ANALYZE_ITEM" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  return items.map((item) => {
    const visible = visiblePhotos(item.photos);
    const cover = visible[0] ? toPhotoDTO(visible[0]) : null;
    const job = item.jobs[0];
    const href = item.status === "ANALYZING" ? `/items/${item.id}/analyzing${job ? `?job=${job.id}` : ""}` : visible.length ? `/sell/review/${item.id}` : `/sell/capture?item=${item.id}`;
    return { id: item.id, title: item.title, sku: item.sku, status: item.status, photoCount: visible.length, coverUrl: cover?.thumbUrl ?? null, updatedAt: item.updatedAt.toISOString(), href };
  });
}

export default async function SellPage() {
  const user = await requireUser();
  const drafts = await loadDrafts(user.id);

  return (
    <Page>
      <PageHeader serif title="What are you selling?" description="Two to four photos is plenty. Clover identifies the item, checks what similar ones sold for, and drafts the listing for you to review." />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
        <section aria-labelledby="sell-start" className="flex flex-col gap-3 lg:sticky lg:top-[calc(var(--topbar-h)+2rem)] lg:self-start">
          <h2 id="sell-start" className="sr-only">
            Start with photos
          </h2>
          <Link
            href="/sell/capture"
            className="group relative flex min-h-44 flex-col justify-between overflow-hidden rounded-md bg-accent p-6 text-on-accent transition-[transform,background-color] duration-(--dur-fast) ease-(--ease-out) hover:bg-accent-hover active:scale-[0.99] sm:min-h-52"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-on-accent/15">
              <Camera className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <span>
              <span className="display block text-2xl sm:text-3xl">Scan an item</span>
              <span className="mt-1 block text-sm opacity-85">Point your camera. Front, back, the label, any flaws.</span>
            </span>
          </Link>
          <Link
            href="/sell/upload"
            className="group flex items-center gap-4 rounded-md border border-border-default bg-surface-raised p-5 text-primary transition-colors duration-(--dur-fast) hover:bg-surface-sunken"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-secondary group-hover:text-primary">
              <Upload className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold">Upload photos</span>
              <span className="mt-0.5 block text-sm text-secondary">From your camera roll or computer. Drag and drop, paste, or pick. HEIC is fine.</span>
            </span>
          </Link>
          <p className="px-1 text-xs text-secondary">Your originals are kept untouched. Location and device data are stripped from every photo.</p>
        </section>

        <section aria-labelledby="sell-drafts">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="sell-drafts" className="text-base font-semibold text-primary">
              Continue a draft
            </h2>
            {drafts.length > 0 && <span className="text-sm tabular text-secondary">{drafts.length}</span>}
          </div>
          {drafts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border-default px-6 py-12 text-center">
              <p className="serif-display text-2xl text-primary">Nothing in progress.</p>
              <p className="mt-2 text-sm text-secondary">Items you start but haven&apos;t finished show up here, photos intact.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {drafts.map((d) => (
                <DraftCard key={d.id} draft={d} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
