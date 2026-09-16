"use client";
import { forwardRef, useRef } from "react";
import { Money } from "@/components/ui/money";
import { Checkbox } from "@/components/ui/switch";
import { AiBadge } from "@/components/ui/badge";
import type { ItemListDTO } from "@/lib/inventory/types";
import { isSoldStatus } from "@/lib/inventory/compute";
import { cn } from "@/lib/utils/cn";
import { CoverImage } from "./cover-image";
import { ItemStatusBadge } from "./status-badge";
import { MarketplaceDots } from "./marketplace-dots";
import { daysLabel } from "./format";

export type ItemCardProps = {
  item: ItemListDTO;
  selected: boolean;
  selectionMode: boolean;
  onOpen: (item: ItemListDTO) => void;
  onToggle: (item: ItemListDTO, shiftKey: boolean) => void;
  onLongPress: (item: ItemListDTO) => void;
  tabIndex: number;
  onFocus: () => void;
};

const LONG_PRESS_MS = 480;

/** Comfortable density: the photo is ≥ 60% of the card; chrome recedes. */
export const ItemCard = forwardRef<HTMLElement, ItemCardProps>(function ItemCard({ item, selected, selectionMode, onOpen, onToggle, onLongPress, tabIndex, onFocus }, ref) {
  const sold = isSoldStatus(item.status);
  const price = sold ? item.soldPrice : item.listPrice ?? item.estimatedValue;
  const priceIsEstimate = !sold && item.listPrice === null && item.estimatedValue !== null;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const startPress = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress(item);
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <article
      ref={ref}
      tabIndex={tabIndex}
      onFocus={onFocus}
      aria-label={`${item.title}, ${item.status.toLowerCase().replace("_", " ")}${price !== null ? `, ${(price / 100).toFixed(2)} dollars` : ""}`}
      aria-selected={selectionMode ? selected : undefined}
      data-selected={selected || undefined}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-sm border bg-surface-raised text-left outline-none transition-[border-color,box-shadow] duration-(--dur-fast)",
        selected ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-border-subtle hover:border-border-default",
      )}
      onClick={(e) => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        if (selectionMode || e.metaKey || e.ctrlKey) onToggle(item, e.shiftKey);
        else onOpen(item);
      }}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => {
        // Long-press on touch devices fires contextmenu; keep the selection gesture clean.
        if (selectionMode) e.preventDefault();
      }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-surface-sunken">
        <CoverImage cover={item.cover} alt={item.title} muted={sold} className={cn("transition-transform duration-(--dur-slow) ease-(--ease-out) group-hover:scale-[1.015]")} />
        <div
          className={cn(
            "absolute left-2 top-2 transition-opacity duration-(--dur-fast)",
            selectionMode || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle(item, false)}
            aria-label={`Select ${item.title}`}
            className="size-6 rounded-[7px] bg-surface-raised/95 shadow-float"
          />
        </div>
        {item.cover?.aiGenerated && <AiBadge label="AI background" className="absolute right-2 top-2 h-5 text-[10px]" />}
        {sold && <span className="absolute inset-x-0 bottom-0 bg-scrim px-3 py-1.5 text-xs font-medium text-white">Sold{item.soldMarketplace ? ` · ${item.soldMarketplace.charAt(0)}${item.soldMarketplace.slice(1).toLowerCase()}` : ""}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-primary">{item.title}</h3>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <Money cents={price} className={cn("text-base font-semibold", priceIsEstimate && "text-secondary")} compact />
          {priceIsEstimate && <span className="text-[11px] text-muted">estimate</span>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <ItemStatusBadge status={item.status} />
          <MarketplaceDots publications={item.publications} soldMarketplace={item.soldMarketplace} size="sm" />
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="tabular">{daysLabel(item.daysOnMarket)}</span>
          {item.pendingOffers > 0 && <span className="font-medium text-warning tabular">{item.pendingOffers === 1 ? "1 offer" : `${item.pendingOffers} offers`}</span>}
        </div>
      </div>
    </article>
  );
});
