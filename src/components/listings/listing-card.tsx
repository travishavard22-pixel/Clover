"use client";
import Link from "next/link";
import { ExternalLink, ImageOff, ListChecks, Package } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button-classes";
import { MenuItem } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import { MonogramTile } from "@/components/marketplaces/monogram-tile";
import { PublicationStatusBadge } from "@/components/marketplaces/publication-status-badge";
import { daysLiveLabel } from "@/components/marketplaces/format";
import { PublishedActions } from "@/components/publish/published-actions";
import type { PublicationMutation } from "@/components/publish/publish-api";
import type { ListingDTO } from "@/lib/marketplaces/listings";
import { cn } from "@/lib/utils/cn";

export type ListingCardProps = { listing: ListingDTO; onChanged: (result: PublicationMutation) => void; index: number };

/** Photo-first listing card: the item image dominates; marketplace, status and actions recede. */
export function ListingCard({ listing, onChanged, index }: ListingCardProps) {
  const reduce = useReducedMotion();
  const { publication: p, item, marketplace } = listing;
  const sold = p.status === "SOLD";
  const needsYou = p.status === "REQUIRES_USER_ACTION" || p.status === "NEEDS_ATTENTION" || p.status === "FAILED";
  const hubHref = `/items/${item.id}/publish`;
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : Math.min(index, 8) * 0.03 }}
      className={cn("group relative flex flex-col overflow-hidden rounded-sm border border-border-subtle bg-surface-raised transition-[border-color] duration-(--dur-fast) hover:border-border-default", needsYou && "border-warning/50")}
      aria-label={`${item.title} on ${marketplace.name}, ${listing.statusLabel.toLowerCase()}`}
    >
      <Link href={hubHref} className="relative block aspect-[4/5] w-full overflow-hidden bg-surface-sunken outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={`Open the publish hub for ${item.title}`}>
        {item.cover ? (
          <img src={item.cover.thumbUrl} alt={item.title} width={item.cover.width} height={item.cover.height} loading="lazy" decoding="async" className={cn("h-full w-full object-cover transition-transform duration-(--dur-slow) ease-(--ease-out) group-hover:scale-[1.015]", sold && "saturate-[0.35] opacity-80")} />
        ) : (
          <span className="flex h-full items-center justify-center text-muted" role="img" aria-label="No photo yet">
            <ImageOff className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
        )}
        <span className="absolute left-2 top-2">
          <MonogramTile shortName={marketplace.shortName} name={marketplace.name} color={marketplace.color} size="sm" className="shadow-float" />
        </span>
        <span className="absolute right-2 top-2">
          <PublicationStatusBadge status={p.status} live className="shadow-float" />
        </span>
        {sold && <span className="absolute inset-x-0 bottom-0 bg-scrim px-3 py-1.5 text-xs font-medium text-white">Sold on {marketplace.shortName}</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-primary">{item.title}</h3>
        <div className="flex items-baseline justify-between gap-2">
          <Money cents={p.price ?? item.listPrice} className="text-base font-semibold" />
          <span className="text-xs text-muted tabular">{listing.daysLive !== null ? daysLiveLabel(listing.daysLive) : marketplace.shortName}</span>
        </div>
        {p.attention && needsYou && <p className="text-xs text-warning">{p.attention.message}</p>}
        {p.status === "FAILED" && p.lastError && <p className="line-clamp-2 text-xs text-danger">{p.lastError}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            {p.externalUrl ? (
              <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "icon-sm")} aria-label={`Open on ${marketplace.name} (new tab)`}>
                <ExternalLink className="size-4" />
              </a>
            ) : (
              <span className="text-xs text-muted">{p.mode === "ASSISTED" && p.status === "PUBLISHED" ? "No link saved" : ""}</span>
            )}
            {item.pendingOffers > 0 && (
              <Link href={`/offers`} className="inline-flex">
                <Badge tone="warning">{item.pendingOffers === 1 ? "1 offer" : `${item.pendingOffers} offers`}</Badge>
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1">
            {p.status === "REQUIRES_USER_ACTION" && (
              <Link href={hubHref} className={buttonClasses("outline", "sm")}>
                <ListChecks className="size-4" aria-hidden /> Finish
              </Link>
            )}
            <PublishedActions
              publication={p}
              marketplaceName={marketplace.name}
              assisted={p.mode === "ASSISTED"}
              onChanged={onChanged}
              layout="menu"
              extraMenu={
                <MenuItem asChild>
                  <Link href={`/items/${item.id}`}>
                    <Package className="size-4" aria-hidden /> View item
                  </Link>
                </MenuItem>
              }
            />
          </div>
        </div>
      </div>
    </motion.article>
  );
}
