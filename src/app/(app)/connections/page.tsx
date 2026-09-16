import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout/page-header";
import { ConnectionsList } from "@/components/connections/connections-list";
import { getConnections } from "@/lib/marketplaces";
import { safeReturnTo } from "@/lib/marketplaces/return-to";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Connections" };

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? null;
  const connections = await getConnections(user.id);
  return (
    <Page>
      <PageHeader title="Connections" description="Where Clover can publish for you, and where it prepares everything so you can post in about a minute. Every limitation is stated on the card." />
      <ConnectionsList initial={connections} notice={{ connected: one("connected"), error: one("error"), marketplace: one("marketplace") }} returnTo={safeReturnTo(one("returnTo"))} />
    </Page>
  );
}
