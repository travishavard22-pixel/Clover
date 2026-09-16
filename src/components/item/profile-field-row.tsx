"use client";
import { ImageIcon } from "lucide-react";
import { ConfidenceBadge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { EvidencedField } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils/cn";
import { InlineEdit } from "./inline-edit";

export type FieldRowProps = {
  label: string;
  field: EvidencedField | null;
  verified: boolean;
  expert: boolean;
  onSave: (value: string) => Promise<void>;
  onEvidence: (photoIndex: number, caption: string) => void;
  photoCount: number;
  /** When the field is null this is rendered as a "Add this" row. */
  clearable?: boolean;
};

/** One row of the identification table: label, editable value, confidence and evidence. */
export function ProfileFieldRow({ label, field, verified, expert, onSave, onEvidence, photoCount }: FieldRowProps) {
  const hasEvidence = field?.evidenceImage !== null && field?.evidenceImage !== undefined && field.evidenceImage >= 1 && field.evidenceImage <= photoCount;
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center" role="row">
      <dt className="pt-0.5 text-sm text-secondary sm:pt-0" role="rowheader">
        {label}
      </dt>
      <dd className="min-w-0 text-sm text-primary" role="cell">
        <InlineEdit value={field?.value ?? ""} label={label} placeholder={`Add ${label.toLowerCase()}`} onSave={onSave} displayClassName={cn("-mx-1 px-1 py-0.5", field ? "font-medium" : "")} maxLength={label === "Dimensions" ? 200 : 120} />
      </dd>
      <dd className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-3" role="cell">
        {field ? (
          verified ? (
            <ConfidenceBadge tier="CONFIDENT" score={1} expert={expert} />
          ) : (
            <ConfidenceBadge tier={field.tier} score={field.confidence} expert={expert} />
          )
        ) : (
          <span className="text-xs text-muted">Not read from photos</span>
        )}
        {field && verified && <span className="text-xs text-muted">Confirmed by you</span>}
        {field && !verified && hasEvidence && (
          <Tooltip content={field.note ? `Photo ${field.evidenceImage}: ${field.note}` : `Read from photo ${field.evidenceImage}`}>
            <button
              type="button"
              onClick={() => onEvidence(field.evidenceImage! - 1, field.note ? `${label}: ${field.note}` : `${label} read from this photo`)}
              aria-label={`Show evidence for ${label} in photo ${field.evidenceImage}`}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-border-subtle bg-surface-raised px-2 text-xs text-secondary hover:bg-surface-sunken"
            >
              <ImageIcon className="size-3" aria-hidden />
              Photo {field.evidenceImage}
            </button>
          </Tooltip>
        )}
        {field && !verified && !hasEvidence && field.note && (
          <Tooltip content={field.note}>
            <span className="cursor-help text-xs text-muted underline decoration-dotted underline-offset-2">Inferred</span>
          </Tooltip>
        )}
      </dd>
    </div>
  );
}
