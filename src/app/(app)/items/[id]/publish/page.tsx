import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/layout/page-header";
import { PublishHub } from "@/components/publish/publish-hub";
import { ApiError } from "@/lib/api";
import { buildPublishHub } from "@/lib/marketplaces/publications";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Publish" };

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let hub;
  try {
    hub = await buildPublishHub(user.id, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const returnTo = `/items/${id}/publish`;
  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href={`/items/${id}`} className="hover:text-primary">
            ← Back to item
          </Link>
        }
        title="Publish"
        description="Pick where this goes. Each row shows exactly what that marketplace will receive; assisted marketplaces walk you through posting it yourself."
      />
      <PublishHub initial={hub} returnTo={returnTo} />
    </Page>
  );
}
