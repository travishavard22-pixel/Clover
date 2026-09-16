import type { Metadata } from "next";
import { UploadScreen } from "@/components/capture/upload-screen";
import { Page, PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { visiblePhotos } from "@/lib/photos/order";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Upload photos" };

/** Upload from disk or camera roll. `?item=` adds photos to an existing draft. */
export default async function UploadPage({ searchParams }: { searchParams: Promise<{ item?: string | string[] }> }) {
  const user = await requireUser();
  const { item } = await searchParams;
  const requested = typeof item === "string" ? item : null;
  let itemId: string | null = null;
  let existingCount = 0;
  let title: string | null = null;
  if (requested) {
    const owned = await db.item.findFirst({ where: { id: requested, userId: user.id }, include: { photos: { select: { id: true, sortOrder: true, kind: true, sourcePhotoId: true } } } });
    if (owned) {
      itemId = owned.id;
      existingCount = visiblePhotos(owned.photos).length;
      title = owned.title;
    }
  }
  return (
    <Page width="narrow">
      <PageHeader
        eyebrow={itemId ? `Adding to ${title}` : "Step 1 of 3"}
        title="Upload photos"
        description={itemId ? `${existingCount} ${existingCount === 1 ? "photo" : "photos"} already on this item. Add more from your device.` : "Pick the photos of one item. Front, back, the label and any flaws give the best identification."}
      />
      <UploadScreen itemId={itemId} existingCount={existingCount} />
    </Page>
  );
}
