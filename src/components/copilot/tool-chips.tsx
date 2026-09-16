"use client";
import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { ToolTraceEntry } from "@/lib/copilot/threads";
import { AiBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { ESTIMATE_TOOLS, toolLabel } from "./copilot-api";

/** "Looked at: inventory summary, 3 stale listings" — expandable to each tool's inputs and summary. */
export function ToolChips({ tools, live }: { tools: ToolTraceEntry[]; live?: boolean }) {
  const [open, setOpen] = useState(false);
  if (tools.length === 0) return null;
  const labels = tools.map((t) => (t.summary && t.summary.length <= 32 ? t.summary : toolLabel(t.name)));
  const hasEstimate = tools.some((t) => ESTIMATE_TOOLS.has(t.name));
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-surface-sunken px-2.5 py-1 text-xs text-secondary transition-colors hover:text-primary", live && "animate-pulse")}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {live ? "Looking at" : "Looked at"}: {labels.join(", ")}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-(--dur-base)", open && "rotate-180")} aria-hidden />
      </button>
      {hasEstimate && <AiBadge className="ml-1.5 h-6" label="Includes estimates" />}
      {open && (
        <ul className="mt-2 space-y-2 rounded-sm border border-border-subtle bg-surface-raised p-3 text-xs">
          {tools.map((t, i) => (
            <li key={`${t.name}-${i}`} className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-primary">{t.name}</span>
                {ESTIMATE_TOOLS.has(t.name) ? <AiBadge label="estimate" className="h-5 text-[10px]" /> : <span className="text-muted">recorded data</span>}
              </div>
              {Object.keys(t.input ?? {}).length > 0 && <code className="block overflow-x-auto whitespace-pre rounded-xs bg-surface-sunken px-2 py-1 font-mono text-[11px] text-secondary">{JSON.stringify(t.input)}</code>}
              <div className="text-secondary">{t.summary || (live ? "Working…" : "No summary")}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
