"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DemoBadge, ConfidenceBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button-classes";
import { Money } from "@/components/ui/money";
import type { ItemSummary } from "@/lib/items/summary";
import { MARKETPLACES } from "@/lib/marketplaces/registry";
import { cn } from "@/lib/utils/cn";

/**
 * The always-visible action: the price the seller is going to list at and "Publish everywhere".
 * Bottom bar above the tab bar on phones; a sticky right rail on desktop (rendered by the parent
 * with `variant="rail"`).
 */
export function StickyCta({ summary, variant }: { summary: ItemSummary; variant: "bar" | "rail" }) {
  const { item, estimate, publications, demo } = summary;
  const price = item.listPrice ?? estimate?.recommended ?? null;
  const live = publications.filter((p) => p.status === "PUBLISHED");
  const publishable = item.status !== "SOLD" && item.status !== "SHIPPED" && item.status !== "COMPLETED" && item.status !== "ARCHIVED" && item.status !== "ANALYZING";
  const label = live.length ? "Manage listings" : "Publish everywhere";

  if (variant === "bar") {
    return (
      <div className="fixed inset-x-0 bottom-(--tabbar-h) z-20 border-t border-border-subtle bg-surface-base/95 px-4 py-2.5 backdrop-blur lg:hidden" role="region" aria-label="Price and publish">
        <div className="mx-auto flex max-w-(--content-max) items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted">{item.listPrice !== null ? "List price" : "Recommended"}</div>
            <div className="flex items-baseline gap-2">
              <Money cents={price} className="text-xl font-semibold text-primary" />
              {demo && <DemoBadge className="h-5" />}
            </div>
          </div>
          <Link href={`/items/${item.id}/publish`} aria-disabled={!publishable} className={cn(buttonClasses("primary", "md"), !publishable && "pointer-events-none opacity-50")}>
            {label}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <aside className="surface-card sticky top-20 space-y-4 p-5" aria-label="Price and publish">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted">{item.listPrice !== null ? "List price" : "Recommended price"}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <Money cents={price} className="display text-3xl text-primary" />
          {estimate && <ConfidenceBadge tier={estimate.confidence} />}
        </div>
        {estimate && item.listPrice !== null && item.listPrice !== estimate.recommended && (
          <p className="mt-1 text-xs text-secondary">
            Recommended <Money cents={estimate.recommended} />
          </p>
        )}
        {demo && <DemoBadge className="mt-2" />}
      </div>
      <Link href={`/items/${item.id}/publish`} aria-disabled={!publishable} className={cn(buttonClasses("primary", "lg"), "w-full", !publishable && "pointer-events-none opacity-50")}>
        {label}
        <ArrowUpRight className="size-4" aria-hidden />
      </Link>
      {live.length > 0 ? (
        <ul className="space-y-1 text-sm text-secondary" aria-label="Live listings">
          {live.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span>{MARKETPLACES[p.marketplace].shortName}</span>
              {p.externalUrl ? (
                <a href={p.externalUrl} target="_blank" rel="noreferrer" className="text-accent-text underline-offset-4 hover:underline">
                  View
                </a>
              ) : (
                <span className="text-muted">Live</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-secondary">{publishable ? "Not listed anywhere yet. Publishing opens a checklist per marketplace." : "Publishing is available once the item is ready."}</p>
      )}
    </aside>
  );
}
