import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout/page-header";
import { ListingsBoard } from "@/components/listings/listings-board";
import { listPublications, parseListingFilters } from "@/lib/marketplaces/listings";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Listings" };

export default async function ListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  const filters = parseListingFilters(sp);
  const [listings, all] = await Promise.all([listPublications(user.id, filters), listPublications(user.id, { marketplace: null, status: "ALL", q: "" })]);
  const live = all.filter((l) => l.publication.status === "PUBLISHED").length;
  const attention = all.filter((l) => l.publication.status === "REQUIRES_USER_ACTION" || l.publication.status === "NEEDS_ATTENTION" || l.publication.status === "FAILED").length;
  return (
    <Page width="wide">
      <PageHeader title="Listings" description={all.length ? `${live} live · ${attention} need${attention === 1 ? "s" : ""} you · ${all.length} total across every marketplace.` : undefined} />
      <ListingsBoard initial={listings} initialFilters={filters} hasAny={all.length > 0} />
    </Page>
  );
}
