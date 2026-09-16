import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout/page-header";
import { OffersInbox } from "@/components/offers/offers-inbox";
import { listOffers, offerableItems } from "@/lib/offers";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Offers" };

export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const focus = (Array.isArray(sp.offer) ? sp.offer[0] : sp.offer) ?? null;
  const [offers, items] = await Promise.all([listOffers(user.id), offerableItems(user.id)]);
  const pending = offers.filter((o) => o.status === "PENDING").length;
  return (
    <Page>
      <PageHeader title="Offers" description={offers.length ? (pending ? `${pending} waiting for your answer.` : "Nothing waiting. Past offers are below.") : undefined} />
      <OffersInbox initial={offers} items={items} focusId={focus} />
    </Page>
  );
}
