import type { Marketplace, PublicationStatus } from "@/lib/db";
import { MARKETPLACES } from "@/lib/marketplaces/registry";
import type { PublicationSummary } from "@/lib/inventory/types";
import { cn } from "@/lib/utils/cn";

const MONOGRAM: Record<Marketplace, string> = { EBAY: "e", FACEBOOK: "f", OFFERUP: "O", NEXTDOOR: "N", CRAIGSLIST: "c", MERCARI: "M", POSHMARK: "P" };

const STATUS_LABEL: Record<PublicationStatus, string> = {
  READY: "ready to publish",
  NEEDS_ATTENTION: "needs attention",
  PUBLISHING: "publishing",
  PUBLISHED: "live",
  FAILED: "failed",
  REQUIRES_USER_ACTION: "needs you",
  ENDED: "ended",
  SOLD: "sold",
};

function ring(status: PublicationStatus): string {
  switch (status) {
    case "PUBLISHED":
    case "SOLD":
      return "border-success";
    case "NEEDS_ATTENTION":
    case "REQUIRES_USER_ACTION":
    case "PUBLISHING":
      return "border-warning";
    case "FAILED":
      return "border-danger";
    default:
      return "border-border-strong";
  }
}

/** Compact monogram per marketplace with a status ring. Full meaning is in the accessible label. */
export function MarketplaceDots({ publications, soldMarketplace, size = "md", className }: { publications: PublicationSummary[]; soldMarketplace?: Marketplace | null; size?: "sm" | "md"; className?: string }) {
  if (publications.length === 0 && !soldMarketplace) return null;
  const list = publications.length ? publications : soldMarketplace ? [{ id: "sold", marketplace: soldMarketplace, status: "SOLD" as PublicationStatus, mode: "ASSISTED" as const, externalUrl: null }] : [];
  const label = list.map((p) => `${MARKETPLACES[p.marketplace].name}: ${STATUS_LABEL[p.status]}`).join(", ");
  return (
    <ul className={cn("flex items-center -space-x-1", className)} aria-label={label}>
      {list.slice(0, 5).map((p) => (
        <li
          key={p.id}
          title={`${MARKETPLACES[p.marketplace].name} · ${STATUS_LABEL[p.status]}${p.mode === "ASSISTED" ? " · assisted" : ""}`}
          className={cn(
            "flex items-center justify-center rounded-full border-[1.5px] bg-surface-raised font-semibold leading-none text-secondary",
            size === "sm" ? "size-5 text-[10px]" : "size-6 text-[11px]",
            ring(p.status),
          )}
        >
          <span aria-hidden>{MONOGRAM[p.marketplace]}</span>
        </li>
      ))}
      {list.length > 5 && <li className={cn("flex items-center justify-center rounded-full border border-border-default bg-surface-sunken text-[10px] text-muted", size === "sm" ? "size-5" : "size-6")}>+{list.length - 5}</li>}
    </ul>
  );
}
