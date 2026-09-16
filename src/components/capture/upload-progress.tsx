"use client";
import { AlertCircle, Check, ImageOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { BatchProgress } from "./upload-client";

export type UploadRow = { id: string; name: string; previewUrl: string | null } & Pick<BatchProgress, "status" | "progress" | "error">;

/**
 * Per-file progress list shown while a batch uploads. Real XHR progress, one row per photo, with a
 * retry for anything that failed. Announces completion through an aria-live region.
 */
export function UploadProgress({
  rows,
  title,
  onRetry,
  onContinue,
  onCancel,
  continueLabel = "Continue",
}: {
  rows: UploadRow[];
  title: string;
  onRetry?: (ids: string[]) => void;
  onContinue?: () => void;
  onCancel?: () => void;
  continueLabel?: string;
}) {
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed");
  const active = rows.some((r) => r.status === "uploading" || r.status === "queued");
  const overall = rows.length ? rows.reduce((acc, r) => acc + (r.status === "done" ? 1 : r.status === "uploading" ? r.progress : 0), 0) / rows.length : 0;

  return (
    <section aria-labelledby="upload-progress-title" className="flex w-full flex-col gap-4">
      <div>
        <h2 id="upload-progress-title" className="text-lg font-semibold text-primary">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-secondary" aria-live="polite">
          {active ? `Saving ${done + 1} of ${rows.length}…` : failed.length ? `${done} saved, ${failed.length} failed` : `${done} ${done === 1 ? "photo" : "photos"} saved`}
        </p>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall * 100)} aria-label="Overall upload progress">
          <div className="h-full rounded-full bg-accent transition-[width] duration-(--dur-base) ease-(--ease-out)" style={{ width: `${Math.round(overall * 100)}%` }} />
        </div>
      </div>
      <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xs border border-border-subtle bg-surface-raised p-2">
            <div className="size-12 shrink-0 overflow-hidden rounded-[6px] bg-surface-sunken">
              {r.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL
                <img src={r.previewUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-muted">
                  <ImageOff className="size-4" aria-hidden />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-primary">{r.name}</div>
              {r.status === "failed" ? (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-danger">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{r.error ?? "Upload failed"}</span>
                </div>
              ) : (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div className={cn("h-full rounded-full transition-[width] duration-(--dur-fast)", r.status === "done" ? "bg-success" : "bg-accent")} style={{ width: `${Math.round((r.status === "done" ? 1 : r.progress) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="w-6 shrink-0 text-center">
              {r.status === "done" && <Check className="mx-auto size-4 text-success" aria-label="Saved" />}
              {r.status === "uploading" && <span className="text-xs tabular text-secondary">{Math.round(r.progress * 100)}%</span>}
              {r.status === "queued" && <span className="text-xs text-muted">Waiting</span>}
            </div>
          </li>
        ))}
      </ul>
      {!active && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Back
            </Button>
          )}
          {failed.length > 0 && onRetry && (
            <Button variant="outline" leadingIcon={<RotateCcw className="size-4" />} onClick={() => onRetry(failed.map((f) => f.id))}>
              Retry {failed.length === 1 ? "photo" : `${failed.length} photos`}
            </Button>
          )}
          {onContinue && done > 0 && (
            <Button onClick={onContinue}>{failed.length ? "Continue without them" : continueLabel}</Button>
          )}
        </div>
      )}
    </section>
  );
}
