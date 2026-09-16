import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemWorkspace } from "@/components/item/item-workspace";
import { ApiError } from "@/lib/api";
import { buildItemSummary } from "@/lib/items/summary";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Review item" };

/**
 * /items/[id] — the review workspace: photos, identification, condition, price and listing for one
 * item. Server component loads everything once; ItemWorkspace owns the interaction.
 */
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let summary;
  try {
    summary = await buildItemSummary(user.id, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  return <ItemWorkspace initial={summary} />;
}
