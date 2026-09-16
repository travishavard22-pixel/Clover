"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { get } from "@/components/marketplaces/api-client";
import type { ConnectionRow } from "@/lib/marketplaces";
import { connectErrorMessage } from "@/lib/marketplaces/connect-errors";
import { isMarketplaceId as isMarketplace, MARKETPLACES } from "@/lib/marketplaces/registry";
import { ConnectionCard } from "./connection-card";

export type ConnectionsNotice = { connected: string | null; error: string | null; marketplace: string | null };

/**
 * The Connections page body. Shows the outcome of an OAuth round-trip once (from `?connected=` /
 * `?error=`), then cleans the URL so a refresh does not repeat the toast. `returnTo` is threaded
 * into every Connect link so the seller lands back where they started (e.g. a publish hub).
 */
export function ConnectionsList({ initial, notice, returnTo }: { initial: ConnectionRow[]; notice: ConnectionsNotice; returnTo: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || (!notice.connected && !notice.error)) return;
    shown.current = true;
    const mpConnected = notice.connected?.toUpperCase() ?? "";
    const mpError = notice.marketplace?.toUpperCase() ?? "";
    if (notice.connected) {
      const name = isMarketplace(mpConnected) ? MARKETPLACES[mpConnected].name : "Marketplace";
      toast.success(`${name} connected`, returnTo ? { description: "You can go back to publishing.", action: { label: "Continue", onClick: () => router.push(returnTo) } } : undefined);
    } else if (notice.error) {
      toast.error(connectErrorMessage(notice.error, isMarketplace(mpError) ? mpError : null));
    }
    const clean = new URLSearchParams();
    if (returnTo) clean.set("returnTo", returnTo);
    const q = clean.toString();
    router.replace(`/connections${q ? `?${q}` : ""}`, { scroll: false });
  }, [notice, returnTo, router]);

  const refresh = useCallback(async () => {
    try {
      const res = await get<{ connections: ConnectionRow[] }>("/api/marketplaces");
      setRows(res.connections);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't refresh connections.");
    }
  }, []);

  const onChanged = (row: ConnectionRow) => setRows((rs) => rs.map((r) => (r.marketplace === row.marketplace ? row : r)));

  const primary = rows.filter((r) => r.tier === "primary");
  const secondary = rows.filter((r) => r.tier === "secondary");

  return (
    <div className="space-y-8">
      {returnTo && (
        <p className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary">
          <span>Connect a marketplace, then head back to where you were.</span>
          <Link href={returnTo} className="inline-flex shrink-0 items-center gap-1 font-medium text-accent-text hover:underline">
            Back <ArrowRight className="size-4" aria-hidden />
          </Link>
        </p>
      )}
      <section aria-labelledby="primary-heading" className="space-y-3">
        <h2 id="primary-heading" className="text-sm font-medium text-secondary">
          Main marketplaces
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {primary.map((r, i) => (
            <ConnectionCard key={r.marketplace} row={r} returnTo={returnTo} onChanged={onChanged} onSynced={refresh} index={i} />
          ))}
        </ul>
      </section>
      {secondary.length > 0 && (
        <section aria-labelledby="secondary-heading" className="space-y-3">
          <h2 id="secondary-heading" className="text-sm font-medium text-secondary">
            Also supported
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {secondary.map((r, i) => (
              <ConnectionCard key={r.marketplace} row={r} returnTo={returnTo} onChanged={onChanged} onSynced={refresh} index={i} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
