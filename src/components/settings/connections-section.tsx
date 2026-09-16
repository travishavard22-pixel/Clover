import Link from "next/link";
import { ArrowRight, Plug } from "lucide-react";
import type { ConnectionStatus, Marketplace } from "@/lib/db";
import { MARKETPLACES } from "@/lib/marketplaces/registry";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Rows, Section } from "./section";

export type ConnectionSummary = { marketplace: Marketplace; status: ConnectionStatus; mode: string; accountName: string | null };

const TONE: Record<ConnectionStatus, { tone: BadgeTone; label: string }> = {
  CONNECTED: { tone: "success", label: "Connected" },
  NEEDS_REAUTH: { tone: "warning", label: "Needs re-authorisation" },
  ERROR: { tone: "danger", label: "Error" },
  NOT_CONNECTED: { tone: "neutral", label: "Not connected" },
};

export function ConnectionsSection({ connections }: { connections: ConnectionSummary[] }) {
  return (
    <Section id="connections" title="Connected marketplaces" description="Connections are managed on their own page: authorise eBay, see token health, disconnect.">
      <Rows>
        {connections.length === 0 ? (
          <p className="py-4 text-sm text-secondary">No marketplace is connected yet. Assisted marketplaces (Facebook, OfferUp) need no connection.</p>
        ) : (
          connections.map((c) => {
            const t = c.mode === "demo" && c.status === "CONNECTED" ? { tone: "warning" as BadgeTone, label: "Demo" } : TONE[c.status];
            return (
              <div key={c.marketplace} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-primary">{MARKETPLACES[c.marketplace].name}</div>
                  <div className="text-xs text-secondary">{c.accountName ?? (c.mode === "assisted" ? "Assisted publishing" : "—")}</div>
                </div>
                <Badge tone={t.tone}>{t.label}</Badge>
              </div>
            );
          })
        )}
        <div className="py-3">
          <Link href="/connections" className="inline-flex items-center gap-2 text-sm font-medium text-accent-text underline-offset-4 hover:underline">
            <Plug className="size-4" aria-hidden /> Manage connections <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </Rows>
    </Section>
  );
}
