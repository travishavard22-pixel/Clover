"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MODE_LABELS, MODE_SHORT_HELP, type ConnectionMode } from "@/lib/marketplaces/labels";
import { cn } from "@/lib/utils/cn";

const tones: Record<ConnectionMode, BadgeTone> = { api: "success", assisted: "info", demo: "warning" };

/**
 * API / Assisted / Demo. Tapping opens the plain-language explanation of why this marketplace
 * works the way it does — the limitation is never hidden behind a hover.
 */
export function ModeBadge({ mode, explanation, marketplaceName, className }: { mode: ConnectionMode; explanation: string; marketplaceName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("group inline-flex items-center rounded-full outline-none", className)} aria-label={`${MODE_LABELS[mode]} mode on ${marketplaceName} — what this means`}>
        <Badge tone={tones[mode]} className="gap-1 group-hover:brightness-95">
          {MODE_LABELS[mode]}
          <Info className="size-3 opacity-70" aria-hidden />
        </Badge>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm" title={`${MODE_LABELS[mode]} mode — ${marketplaceName}`} description={MODE_SHORT_HELP[mode]}>
          <p className="text-sm leading-relaxed text-primary">{explanation}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
