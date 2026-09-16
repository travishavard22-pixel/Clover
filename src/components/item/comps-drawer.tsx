"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Money } from "@/components/ui/money";
import { Switch } from "@/components/ui/switch";
import type { CompDTO } from "@/lib/pricing/dto";
import { cn } from "@/lib/utils/cn";
import { errorMessage } from "./item-api";

/**
 * The comparables behind the estimate. Each row says whether it is market evidence or demo data,
 * why it was excluded, and lets the seller include or exclude it (which re-prices immediately).
 */
export function CompsDrawer({ open, onClose, comps, onToggle }: { open: boolean; onClose: () => void; comps: CompDTO[]; onToggle: (compId: string, included: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (c: CompDTO, included: boolean) => {
    setBusy(c.id);
    try {
      await onToggle(c.id, included);
    } catch (err) {
      toast.error("Couldn't update the comparable", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };
  const included = comps.filter((c) => c.included).length;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Comparable listings" description={`${included} of ${comps.length} used in the estimate. Toggling one re-prices the item.`} size="lg">
        {comps.length === 0 ? (
          <p className="text-sm text-secondary">No comparable listings were found for this item. The estimate is an AI estimate from category priors.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {comps.map((c) => (
              <li key={c.id} className={cn("flex gap-3 py-3", !c.included && "opacity-70")}>
                <div className="size-16 shrink-0 overflow-hidden rounded-xs border border-border-subtle bg-surface-sunken">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- third-party listing thumbnail
                    <img src={c.imageUrl} alt="" width={64} height={64} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[10px] text-muted">No image</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium text-primary">{c.title}</p>
                    <Switch checked={c.included} disabled={busy === c.id} onCheckedChange={(v) => void toggle(c, v)} aria-label={`${c.included ? "Exclude" : "Include"} "${c.title}"`} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
                    <span>
                      <Money cents={c.price} className="font-medium text-primary" />
                      {c.shipping > 0 ? (
                        <>
                          {" "}
                          + <Money cents={c.shipping} /> shipping
                        </>
                      ) : (
                        " · free shipping"
                      )}
                    </span>
                    {c.condition && <span>{c.condition}</span>}
                    {c.soldAt ? <span>Sold {new Date(c.soldAt).toLocaleDateString()}</span> : c.listedAt ? <span>Listed {new Date(c.listedAt).toLocaleDateString()}</span> : null}
                    <span className="tabular">{Math.round(c.similarity * 100)}% match</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {c.isMarketEvidence ? <Badge tone="success">Market evidence</Badge> : c.source === "USER_REPORTED" ? <Badge tone="info">Reported by you</Badge> : <DemoBadge />}
                    {c.userOverride && <Badge tone="accent">{c.userOverride === "include" ? "Included by you" : "Excluded by you"}</Badge>}
                    {!c.included && c.exclusionReason && !c.userOverride && <span className="text-xs text-muted">Excluded: {c.exclusionReason}</span>}
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-text underline-offset-4 hover:underline">
                        Open listing
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
