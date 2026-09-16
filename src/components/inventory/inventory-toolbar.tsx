"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Rows3, ScanLine, Search, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, Segmented } from "@/components/ui/select";
import type { ItemStatus, Marketplace } from "@/lib/db";
import { ITEM_STATUS_META } from "@/lib/items/status";
import { SORT_KEYS, SORT_LABELS, type ListFilters, type SortKey } from "@/lib/inventory/types";
import { ALL_MARKETPLACES, MARKETPLACES } from "@/lib/marketplaces/registry";
import { cn } from "@/lib/utils/cn";
import type { Density } from "./use-density";

const CHIP_STATUSES: ItemStatus[] = ["DRAFT", "READY", "LISTED", "OFFER_RECEIVED", "SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"];

export type ToolbarProps = {
  filters: ListFilters;
  onChange: (patch: Partial<ListFilters>) => void;
  density: Density;
  onDensity: (d: Density) => void;
  resultCount: number | null;
  searching: boolean;
};

export function InventoryToolbar({ filters, onChange, density, onDensity, resultCount, searching }: ToolbarProps) {
  const [q, setQ] = useState(filters.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local text in sync when filters are reset from outside (e.g. "Clear filters").
  useEffect(() => {
    setQ(filters.q ?? "");
  }, [filters.q]);

  const commit = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange({ q: value }), 250);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const statuses = filters.status ?? [];
  const toggleStatus = (s: ItemStatus) => {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    onChange({ status: next, includeArchived: next.includes("ARCHIVED") ? true : filters.includeArchived });
  };
  const hasFilters = !!filters.q?.trim() || statuses.length > 0 || !!filters.marketplace || (filters.sort && filters.sort !== "newest");

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              commit(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (timer.current) clearTimeout(timer.current);
                onChange({ q });
              }
              if (e.key === "Escape" && q) {
                setQ("");
                onChange({ q: "" });
              }
            }}
            placeholder="Search title, brand, SKU or shelf…"
            aria-label="Search inventory"
            className="pl-9 pr-9"
            autoComplete="off"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                onChange({ q: "" });
              }}
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-primary"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
          <span className="sr-only" aria-live="polite">
            {searching ? "Searching…" : resultCount !== null ? `${resultCount} item${resultCount === 1 ? "" : "s"} shown` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Marketplace"
            value={filters.marketplace ?? "ALL"}
            onValueChange={(v) => onChange({ marketplace: v === "ALL" ? undefined : (v as Marketplace) })}
            options={[{ value: "ALL", label: "All marketplaces" }, ...ALL_MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACES[m].name }))]}
            className="h-9 w-auto min-w-40 text-sm"
          />
          <Select
            aria-label="Sort"
            value={filters.sort ?? "newest"}
            onValueChange={(v) => onChange({ sort: v as SortKey })}
            options={SORT_KEYS.map((k) => ({ value: k, label: SORT_LABELS[k] }))}
            className="h-9 w-auto min-w-40 text-sm"
          />
          <Segmented
            aria-label="Density"
            size="sm"
            value={density}
            onChange={onDensity}
            options={[
              { value: "comfortable", label: <span className="flex items-center gap-1.5"><LayoutGrid className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Photos</span></span> },
              { value: "compact", label: <span className="flex items-center gap-1.5"><Rows3 className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Compact</span></span> },
            ]}
          />
          <Link href="/sell?intent=find" className={buttonClasses("outline", "sm", "gap-1.5")} title="Photograph an item to find it in your inventory">
            <ScanLine className="size-4" aria-hidden />
            Scan to find
          </Link>
        </div>
      </div>
      <div className="hide-scrollbar -mx-(--gutter) flex items-center gap-1.5 overflow-x-auto px-(--gutter) md:mx-0 md:px-0" role="group" aria-label="Filter by status">
        {CHIP_STATUSES.map((s) => {
          const on = statuses.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStatus(s)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-(--dur-fast)",
                on ? "border-accent bg-accent-soft text-accent-text" : "border-border-default bg-surface-raised text-secondary hover:bg-surface-sunken hover:text-primary",
              )}
            >
              {ITEM_STATUS_META[s].label}
            </button>
          );
        })}
        {hasFilters && (
          <Button variant="ghost" size="sm" className="shrink-0 text-muted" onClick={() => onChange({ q: "", status: [], marketplace: undefined, sort: "newest", includeArchived: false })}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
