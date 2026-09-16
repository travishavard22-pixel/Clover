"use client";
import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Money } from "@/components/ui/money";
import type { PublishRowPreview } from "@/lib/marketplaces/publications";
import { cn } from "@/lib/utils/cn";

/**
 * What this marketplace will receive: the fitted title with its character count against the
 * limit, a description excerpt, price with the fee estimate and net, condition in the
 * marketplace's own vocabulary, the category hint and the photo count against the cap.
 */
export function RowPreview({ preview, marketplaceShortName, compact }: { preview: PublishRowPreview; marketplaceShortName: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const overTitle = preview.titleLength > preview.titleMax;
  const nearTitle = !overTitle && preview.titleLength >= preview.titleMax - 5;
  const overPhotos = preview.photoCount >= preview.photosMax;
  const excerpt = preview.description.trim();
  const longDescription = excerpt.length > 180;

  return (
    <div className={cn("min-w-0 space-y-2", compact && "space-y-1.5")}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-primary" title={preview.title}>
          {preview.title || <span className="text-muted">No title yet</span>}
        </p>
        <span className={cn("shrink-0 tabular text-xs", overTitle ? "font-medium text-danger" : nearTitle ? "text-warning" : "text-muted")} aria-label={`Title length ${preview.titleLength} of ${preview.titleMax} characters${overTitle ? ", over the limit" : ""}`}>
          {preview.titleLength}/{preview.titleMax}
        </span>
      </div>
      {excerpt && (
        <div>
          <p className={cn("whitespace-pre-line text-sm leading-relaxed text-secondary", !expanded && "line-clamp-2")}>{excerpt}</p>
          {longDescription && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline" aria-expanded={expanded}>
              {expanded ? "Show less" : "Show full description"}
              <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
          )}
        </div>
      )}
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Price</dt>
          <dd className="flex items-baseline gap-1.5">
            {preview.priceCents ? (
              <>
                <Money cents={preview.priceCents} className="text-sm font-semibold text-primary" />
                <span className="text-muted" title={preview.feeNote}>
                  {preview.fees > 0 ? (
                    <>
                      − <Money cents={preview.fees} /> est. fees → <Money cents={preview.net} className="text-primary" /> net
                    </>
                  ) : (
                    "no selling fees"
                  )}
                </span>
              </>
            ) : (
              <span className="font-medium text-warning">No price set</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Condition</dt>
          <dd>{preview.conditionLabel}</dd>
        </div>
        {preview.categoryHint && (
          <div className="min-w-0 max-w-full">
            <dt className="sr-only">Suggested category</dt>
            <dd className="truncate" title={preview.categoryHint}>
              Category: {preview.categoryHint}
            </dd>
          </div>
        )}
        <div>
          <dt className="sr-only">Photos</dt>
          <dd className={cn("tabular", overPhotos && "text-warning")} title={`${marketplaceShortName} accepts up to ${preview.photosMax} photos`}>
            {preview.photoCount}/{preview.photosMax} photos
          </dd>
        </div>
        {!compact && (
          <div className="min-w-0 max-w-full">
            <dt className="sr-only">Delivery</dt>
            <dd className="truncate">{preview.shippingLine}</dd>
          </div>
        )}
      </dl>
      {preview.warnings.length > 0 && (
        <ul className="space-y-1" aria-label="Listing warnings">
          {preview.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      {preview.draftSource === "generic" && !compact && <p className="text-xs text-muted">Using the generic listing — no {marketplaceShortName}-specific draft yet.</p>}
    </div>
  );
}
