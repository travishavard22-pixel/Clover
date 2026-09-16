"use client";
import { forwardRef } from "react";
import { Money } from "@/components/ui/money";
import { Checkbox } from "@/components/ui/switch";
import type { ItemListDTO } from "@/lib/inventory/types";
import { isSoldStatus } from "@/lib/inventory/compute";
import { cn } from "@/lib/utils/cn";
import { CoverImage } from "./cover-image";
import { ItemStatusBadge } from "./status-badge";
import { MarketplaceDots } from "./marketplace-dots";
import { shortDays } from "./format";
import type { ItemCardProps } from "./item-card";

/** Compact density: a dense, scannable table row. Money and counts are tabular. */
export const ItemRow = forwardRef<HTMLTableRowElement, ItemCardProps>(function ItemRow({ item, selected, selectionMode, onOpen, onToggle, tabIndex, onFocus }, ref) {
  const sold = isSoldStatus(item.status);
  const price = sold ? item.soldPrice : item.listPrice;
  const profit = sold ? item.profit : item.estimatedProfit;
  return (
    <tr
      ref={ref}
      tabIndex={tabIndex}
      onFocus={onFocus}
      aria-selected={selectionMode ? selected : undefined}
      data-selected={selected || undefined}
      className={cn("group cursor-pointer border-b border-border-subtle outline-none transition-colors duration-(--dur-fast) hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken", selected && "bg-accent-soft/60 hover:bg-accent-soft/80")}
      onClick={(e) => {
        if (selectionMode || e.metaKey || e.ctrlKey) onToggle(item, e.shiftKey);
        else onOpen(item);
      }}
    >
      <td className="w-10 px-2 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={() => onToggle(item, false)} aria-label={`Select ${item.title}`} className={cn(!selectionMode && !selected && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")} />
      </td>
      <td className="w-12 px-1 py-2 align-middle">
        <div className="size-10 overflow-hidden rounded-[6px] bg-surface-sunken">
          <CoverImage cover={item.cover} alt="" muted={sold} />
        </div>
      </td>
      <td className="min-w-0 px-3 py-2 align-middle">
        <div className="truncate text-sm font-medium text-primary">{item.title}</div>
        <div className="truncate font-mono text-[11px] text-muted">
          {item.sku}
          {item.storageLocation ? ` · ${item.storageLocation}` : ""}
        </div>
      </td>
      <td className="px-3 py-2 align-middle">
        <ItemStatusBadge status={item.status} />
      </td>
      <td className="hidden px-3 py-2 align-middle md:table-cell">
        <MarketplaceDots publications={item.publications} soldMarketplace={item.soldMarketplace} size="sm" />
      </td>
      <td className="px-3 py-2 text-right align-middle">
        <Money cents={price} className="text-sm font-medium" />
        {!sold && price === null && item.estimatedValue !== null && (
          <div className="text-[11px] text-muted">
            est. <Money cents={item.estimatedValue} compact />
          </div>
        )}
      </td>
      <td className="hidden px-3 py-2 text-right align-middle lg:table-cell">
        {profit === null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={cn("text-sm tabular", profit < 0 ? "text-danger" : "text-secondary")}>
            {sold ? "" : "≈ "}
            <Money cents={profit} compact />
          </span>
        )}
      </td>
      <td className="hidden px-3 py-2 text-right align-middle tabular text-sm text-secondary sm:table-cell">{shortDays(item.daysOnMarket)}</td>
      <td className="hidden px-3 py-2 text-right align-middle tabular text-sm text-secondary lg:table-cell">{item.pendingOffers || "—"}</td>
    </tr>
  );
});
