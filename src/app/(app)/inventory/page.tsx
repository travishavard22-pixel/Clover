import type { Metadata } from "next";
import { InventoryBrowser } from "@/components/inventory/inventory-browser";
import { Page, PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { filtersFromSearchParams, listItems } from "@/lib/inventory";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  const filters = filtersFromSearchParams(sp);
  const [result, total] = await Promise.all([listItems(user.id, { ...filters, cursor: null }), db.item.count({ where: { userId: user.id } })]);
  return (
    <Page width="wide">
      <PageHeader title="Inventory" description={total > 0 ? `${total} item${total === 1 ? "" : "s"} — photo-first, filters one tap away.` : undefined} />
      <InventoryBrowser initial={result} initialFilters={filters} hasAnyItems={total > 0} />
    </Page>
  );
}
