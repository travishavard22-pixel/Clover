import { ShieldCheck } from "lucide-react";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button-classes";
import { MonogramTile } from "@/components/marketplaces/monogram-tile";
import { MARKETPLACES } from "@/lib/marketplaces/registry";

/**
 * A faithful stand-in for eBay's consent screen, used only when eBay credentials are not
 * configured. It is labelled Demo everywhere and sends nothing to eBay: "Allow" completes the
 * same callback route the real flow would, with a locally generated account.
 */
export function DemoConsentScreen({ state, valid, userName, scopes }: { state: string; valid: boolean; userName: string; scopes: Array<{ scope: string; label: string }> }) {
  const info = MARKETPLACES.EBAY;
  const callback = `/api/marketplaces/ebay/callback?state=${encodeURIComponent(state)}`;
  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-3">
            <MonogramTile shortName={info.shortName} name={info.name} color={info.color} size="md" />
            <div>
              <p className="text-sm font-semibold text-primary">Sign in to eBay (simulated)</p>
              <p className="text-xs text-secondary">auth.ebay.com would appear here with real credentials</p>
            </div>
          </div>
          <DemoBadge />
        </div>
        <div className="space-y-5 px-5 py-5">
          <p className="text-sm leading-relaxed text-primary">
            <span className="font-medium">Clover</span> would like to access your eBay account{userName ? ` for ${userName}` : ""}. Nothing here is sent to eBay: the account, listing ids, fee preview and buyer offers are generated locally so you can walk the whole flow.
          </p>
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              <ShieldCheck className="size-3.5" aria-hidden /> Clover is asking to
            </h2>
            <ul className="divide-y divide-border-subtle rounded-sm border border-border-subtle">
              {scopes.map((s) => (
                <li key={s.scope} className="px-3 py-2.5 text-sm text-primary">
                  {s.label}
                </li>
              ))}
            </ul>
          </div>
          {valid ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <a href={`${callback}&error=access_denied`} className={buttonClasses("ghost", "md")}>
                Cancel
              </a>
              <a href={`${callback}&code=demo-consent`} className={buttonClasses("primary", "md")}>
                Allow (demo)
              </a>
            </div>
          ) : (
            <div className="space-y-3 rounded-sm border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
              <p className="font-medium text-primary">This sign-in link has expired or was already used.</p>
              <p className="text-secondary">Links are single-use and last ten minutes. Start again from Connections.</p>
              <a href="/api/marketplaces/ebay/connect" className={buttonClasses("outline", "sm")}>
                Start again
              </a>
            </div>
          )}
          <p className="flex items-center gap-2 text-xs text-muted">
            <Badge tone="neutral">Demo</Badge>
            With EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_RU_NAME configured this page is replaced by eBay&apos;s own consent screen.
          </p>
        </div>
      </div>
    </div>
  );
}
