import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Page } from "@/components/layout/page-header";
import { DemoConsentScreen } from "@/components/connections/demo-consent-screen";
import { marketplaceMode } from "@/lib/marketplaces";
import { EBAY_USER_SCOPES } from "@/lib/marketplaces/ebay/config";
import { peekOAuthState } from "@/lib/marketplaces/oauth-state";
import { describeScope } from "@/lib/marketplaces/scopes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Demo consent — eBay" };

/**
 * Stands in for auth.ebay.com when eBay credentials are not configured. Same shape as the real
 * consent page: what Clover asks for, in plain language, and an Allow / Cancel choice. It only
 * exists in demo mode; with real credentials the connect route sends the seller to eBay itself.
 */
export default async function DemoConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (marketplaceMode("EBAY") !== "demo") redirect("/connections");
  const sp = await searchParams;
  const state = (Array.isArray(sp.state) ? sp.state[0] : sp.state) ?? "";
  const valid = await peekOAuthState(user.id, "EBAY", state);
  return (
    <Page width="narrow">
      <DemoConsentScreen state={state} valid={valid} userName={user.name} scopes={EBAY_USER_SCOPES.map(describeScope)} />
    </Page>
  );
}
