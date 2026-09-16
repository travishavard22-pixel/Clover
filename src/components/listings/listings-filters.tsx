"use client";
import { LayoutGrid, Rows3, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/select";
import type { Marketplace } from "@/lib/db";
import type { ListingFilters } from "@/lib/marketplaces/listing-filters";
import { MARKETPLACE_ORDER } from "@/lib/marketplaces/labels";
import { MARKETPLACES } from "@/lib/marketplaces/registry";

export type ListingsView = "cards" | "table";

const STATUS_OPTIONS: Array<{ value: ListingFilters["status"]; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "LIVE", label: "Live & in progress" },
  { value: "PUBLISHED", label: "Live" },
  { value: "REQUIRES_USER_ACTION", label: "Your turn" },
  { value: "NEEDS_ATTENTION", label: "Needs attention" },
  { value: "PUBLISHING", label: "Publishing" },
  { value: "FAILED", label: "Failed" },
  { value: "ENDED", label: "Ended" },
  { value: "SOLD", label: "Sold" },
];

export function ListingsFilters({ filters, onChange, view, onView, count }: { filters: ListingFilters; onChange: (next: ListingFilters) => void; view: ListingsView; onView: (v: ListingsView) => void; count: number }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input type="search" aria-label="Search listings by item title or SKU" placeholder="Search by title or SKU" value={filters.q} onChange={(e) => onChange({ ...filters, q: e.target.value })} className="pl-9" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filter by marketplace"
          value={filters.marketplace ?? "ALL"}
          onValueChange={(v) => onChange({ ...filters, marketplace: v === "ALL" ? null : (v as Marketplace) })}
          options={[{ value: "ALL", label: "All marketplaces" }, ...MARKETPLACE_ORDER.map((m) => ({ value: m, label: MARKETPLACES[m].name }))]}
          className="w-full sm:w-48"
        />
        <Select aria-label="Filter by status" value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v as ListingFilters["status"] })} options={STATUS_OPTIONS} className="w-full sm:w-48" />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted tabular" aria-live="polite">
            {count} listing{count === 1 ? "" : "s"}
          </span>
          <Segmented
            aria-label="View"
            size="sm"
            value={view}
            onChange={onView}
            options={[
              { value: "cards", label: <LayoutGrid className="size-4" aria-label="Cards" /> },
              { value: "table", label: <Rows3 className="size-4" aria-label="Table" /> },
            ]}
            className="hidden md:inline-flex"
          />
        </div>
      </div>
    </div>
  );
}
