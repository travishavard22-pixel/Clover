"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import type { SelfCheck } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils/cn";

/** "Fact-checked: 0 unsupported claims", or the list of claims the verified attributes do not support. */
export function SelfCheckBadge({ selfCheck }: { selfCheck: SelfCheck | null }) {
  const [open, setOpen] = useState(false);
  if (!selfCheck) return <span className="text-xs text-muted">Not fact-checked yet</span>;
  const unsupported = selfCheck.claims.filter((c) => !c.supported);
  const ok = selfCheck.unsupportedCount === 0 && unsupported.length === 0;
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <CheckCircle2 className="size-3.5" aria-hidden />
        Fact-checked: 0 unsupported claims
      </span>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs text-warning">
        <AlertTriangle className="size-3.5" aria-hidden />
        {unsupported.length} claim{unsupported.length === 1 ? "" : "s"} not supported by the verified facts
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 rounded-sm border border-warning/40 bg-warning-soft/40 p-2 text-xs text-primary">
          {unsupported.map((c, i) => (
            <li key={i}>“{c.claim}”</li>
          ))}
          <li className="pt-1 text-muted">Edit the copy or confirm the fact in Identification to clear these.</li>
        </ul>
      )}
    </div>
  );
}
