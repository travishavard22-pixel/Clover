"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { RequestError } from "@/components/marketplaces/api-client";
import { useCopy } from "@/components/marketplaces/use-copy";
import type { PublicationDTO } from "@/lib/marketplaces/publications";
import type { ChecklistStep } from "@/lib/marketplaces/types";
import { cn } from "@/lib/utils/cn";
import { photoPackUrl, publishApi } from "./publish-api";

export type AssistedSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication: PublicationDTO;
  marketplaceName: string;
  marketplaceShortName: string;
  itemId: string;
  itemTitle: string;
  disclosure: string | null;
  rowNote: string | null;
  onChanged: (publication: PublicationDTO) => void;
};

/**
 * The guided flow for an assisted marketplace. Every step is something the seller does on the
 * marketplace's own site; Clover supplies copy buttons, the photo pack, a plain link and a place
 * to record the result. Nothing here automates the marketplace.
 */
export function AssistedSheet(props: AssistedSheetProps) {
  const { open, onOpenChange, publication, marketplaceName, marketplaceShortName, itemId, disclosure, rowNote, onChanged } = props;
  const attention = publication.attention?.code ?? null;
  const isActionFlow = publication.status === "REQUIRES_USER_ACTION" && (attention === "end_listing" || attention === "update_price" || attention === "double_sell_guard");
  const steps = publication.checklist;
  const done = steps.filter((s) => s.done).length;
  const [url, setUrl] = useState(publication.externalUrl ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"confirm" | "mark" | "action" | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setUrl(publication.externalUrl ?? "");
  }, [publication.externalUrl, publication.id]);

  // Reopening after the draft changed: refresh the copy text and photo count, keeping the seller's ticks.
  const rebuiltFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open || isActionFlow || publication.status !== "REQUIRES_USER_ACTION" || rebuiltFor.current === publication.id) return;
    rebuiltFor.current = publication.id;
    publishApi
      .rebuild(publication.id)
      .then((res) => onChanged(res.publication))
      .catch(() => {
        // The stored checklist still works; nothing to show.
      });
  }, [open, isActionFlow, publication.id, publication.status, onChanged]);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof File === "undefined") return;
    try {
      const probe = new File([new Uint8Array([0])], "probe.zip", { type: "application/zip" });
      setCanShare(!!navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShare(false);
    }
  }, []);

  const title = isActionFlow ? (attention === "update_price" ? `Change the price on ${marketplaceName}` : `End the ${marketplaceName} listing`) : `Post on ${marketplaceName}`;
  const description = isActionFlow ? publication.attention?.message ?? undefined : disclosure ?? undefined;

  const toggle = async (step: ChecklistStep, next: boolean) => {
    setPendingKeys((s) => new Set(s).add(step.key));
    try {
      const res = await publishApi.step(publication.id, step.key, next);
      onChanged(res.publication);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that step.");
    } finally {
      setPendingKeys((s) => {
        const n = new Set(s);
        n.delete(step.key);
        return n;
      });
    }
  };

  const confirmPosted = async (withUrl: boolean) => {
    setBusy(withUrl ? "confirm" : "mark");
    setUrlError(null);
    try {
      const res = await publishApi.confirm(publication.id, withUrl && url.trim() ? url.trim() : null);
      onChanged(res.publication);
      toast.success(`Recorded as live on ${marketplaceName}`, { description: withUrl && url.trim() ? "The link is saved on the listing." : "You can add the listing link later from Listings." });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof RequestError && err.code === "bad_url") setUrlError(err.message);
      else toast.error(err instanceof Error ? err.message : "Couldn't record this. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  const confirmAction = async () => {
    setBusy("action");
    try {
      const res = await publishApi.confirmAction(publication.id);
      onChanged(res.publication);
      toast.success(attention === "update_price" ? `Price recorded on ${marketplaceName}` : `${marketplaceName} listing recorded as ended`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record this. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  const packUrl = useMemo(() => photoPackUrl(itemId, publication.marketplace), [itemId, publication.marketplace]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title={title} description={description}>
        <div className="space-y-5">
          <p className="text-xs text-secondary" aria-live="polite">
            {done} of {steps.length} steps done
          </p>
          <ol className="divide-y divide-border-subtle rounded-sm border border-border-subtle">
            {steps.map((step, i) => (
              <li key={step.key} className="flex items-start gap-3 px-3 py-3">
                <Checkbox id={`step-${publication.id}-${step.key}`} checked={step.done} disabled={pendingKeys.has(step.key) || step.key === "posted" || step.key === "updated"} onCheckedChange={(v) => toggle(step, v === true)} aria-label={`Step ${i + 1}: ${step.label}`} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-2">
                  <label htmlFor={`step-${publication.id}-${step.key}`} className={cn("block text-sm leading-5 text-primary", step.done && "text-secondary line-through decoration-border-strong")}>
                    {step.label}
                  </label>
                  <StepControls step={step} packUrl={packUrl} canShare={canShare} marketplaceShortName={marketplaceShortName} itemTitle={props.itemTitle} onDone={() => (step.done ? undefined : toggle(step, true))} />
                  {step.key === "posted" && !isActionFlow && (
                    <div className="space-y-2 pt-1">
                      <Field label={`Listing link on ${marketplaceShortName}`} hint="Paste the URL of your live listing. Clover stores it as a plain link and never opens it for you." error={urlError} optional>
                        {(f) => <Input {...f} type="url" inputMode="url" placeholder={`https://…${domainHint(publication.marketplace)}/…`} value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />}
                      </Field>
                      <Button size="sm" onClick={() => confirmPosted(true)} loading={busy === "confirm"} disabled={busy !== null}>
                        I posted it
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {rowNote && <p className="text-xs text-secondary">{rowNote}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {isActionFlow ? (
              <Button onClick={confirmAction} loading={busy === "action"} disabled={busy !== null}>
                {attention === "update_price" ? "I changed the price" : "I ended the listing"}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => confirmPosted(false)} loading={busy === "mark"} disabled={busy !== null} title="Records the listing as live without a link">
                Mark as published
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function domainHint(marketplace: PublicationDTO["marketplace"]): string {
  const hints: Record<PublicationDTO["marketplace"], string> = { EBAY: "ebay.com", FACEBOOK: "facebook.com", OFFERUP: "offerup.com", NEXTDOOR: "nextdoor.com", CRAIGSLIST: "craigslist.org", MERCARI: "mercari.com", POSHMARK: "poshmark.com" };
  return hints[marketplace];
}

function StepControls({ step, packUrl, canShare, marketplaceShortName, itemTitle, onDone }: { step: ChecklistStep; packUrl: string; canShare: boolean; marketplaceShortName: string; itemTitle: string; onDone: () => void }) {
  const { state, copy } = useCopy();
  const [sharing, setSharing] = useState(false);

  if (step.copyText) {
    const preview = step.copyText.length > 140 ? `${step.copyText.slice(0, 140)}…` : step.copyText;
    return (
      <div className="space-y-2">
        {step.key !== "price" && <p className="whitespace-pre-line rounded-xs bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-secondary">{preview}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            leadingIcon={state === "copied" ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            onClick={async () => {
              const ok = await copy(step.copyText!);
              if (ok) onDone();
            }}
            aria-live="polite"
          >
            {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : step.key === "price" ? `Copy ${step.copyText}` : "Copy"}
          </Button>
          {state === "failed" && <textarea readOnly value={step.copyText} aria-label="Text to copy" className="h-16 w-full rounded-xs border border-border-default bg-surface-raised p-2 text-xs" onFocus={(e) => e.currentTarget.select()} />}
        </div>
      </div>
    );
  }

  if (step.key === "photos") {
    const share = async () => {
      setSharing(true);
      try {
        const res = await fetch(packUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error("Couldn't build the photo pack.");
        const blob = await res.blob();
        const file = new File([blob], `${marketplaceShortName.toLowerCase()}-photos.zip`, { type: "application/zip" });
        await navigator.share({ files: [file], title: `${itemTitle} — photos for ${marketplaceShortName}` });
        onDone();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : "Sharing didn't work. Download the pack instead.");
      } finally {
        setSharing(false);
      }
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <a href={packUrl} download className={buttonClasses("outline", "sm")} onClick={() => onDone()}>
          <Download className="size-4" aria-hidden />
          Download photo pack
        </a>
        {canShare && (
          <Button size="sm" variant="ghost" leadingIcon={<Share2 className="size-4" aria-hidden />} onClick={share} loading={sharing}>
            Share to {marketplaceShortName} app
          </Button>
        )}
        <span className="text-xs text-muted">JPEG, long edge 2000 px, in listing order.</span>
      </div>
    );
  }

  if (step.href) {
    return (
      <a href={step.href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm")} onClick={() => onDone()}>
        <ExternalLink className="size-4" aria-hidden />
        Open {marketplaceShortName}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return null;
}
