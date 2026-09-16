import type { Metadata } from "next";
import { CaptureScreen } from "@/components/capture/capture-screen";
import { db } from "@/lib/db";
import { visiblePhotos } from "@/lib/photos/order";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Scan an item" };

/** Full-screen camera. `?item=` adds photos to an existing draft instead of creating a new one. */
export default async function CapturePage({ searchParams }: { searchParams: Promise<{ item?: string | string[] }> }) {
  const user = await requireUser();
  const { item } = await searchParams;
  const requested = typeof item === "string" ? item : null;
  let itemId: string | null = null;
  let existingCount = 0;
  if (requested) {
    const owned = await db.item.findFirst({ where: { id: requested, userId: user.id }, include: { photos: { select: { id: true, sortOrder: true, kind: true, sourcePhotoId: true } } } });
    if (owned) {
      itemId = owned.id;
      existingCount = visiblePhotos(owned.photos).length;
    }
  }
  return <CaptureScreen itemId={itemId} existingCount={existingCount} />;
}
