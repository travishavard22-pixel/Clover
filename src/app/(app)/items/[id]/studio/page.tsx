import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { db } from "@/lib/db";
import { capabilities } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { rendersView } from "@/lib/studio/renders";
import { segmentationStatus } from "@/lib/studio/segmentation";

export const metadata: Metadata = { title: "Studio" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ photo?: string; render?: string }> };

/**
 * /items/[id]/studio — the photo studio for one item. Server component: loads the gallery and
 * provenance once; everything interactive lives in StudioWorkspace.
 */
export default async function StudioPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const item = await db.item.findFirst({ where: { id, userId: user.id }, select: { id: true, title: true } });
  if (!item) notFound();
  const view = await rendersView(item.id);
  return (
    <StudioWorkspace
      item={{ id: item.id, title: item.title }}
      initial={view}
      segmentation={segmentationStatus()}
      demo={capabilities.demoMode || !capabilities.ai}
      initialPhotoId={typeof sp.photo === "string" ? sp.photo : undefined}
      initialRenderId={typeof sp.render === "string" ? sp.render : undefined}
    />
  );
}
