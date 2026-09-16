"use client";
import { AlertCircle, Check, Circle, Loader2, Minus } from "lucide-react";
import type { JobEventsState } from "@/hooks/use-job-events";
import type { JobStep } from "@/lib/jobs/types";
import { cn } from "@/lib/utils/cn";

/** The step checklist for a background job, fed by the job's real event stream. */
export function JobChecklist({ state, doneText, className }: { state: JobEventsState; doneText: string; className?: string }) {
  const running = state.steps.find((s) => s.status === "running");
  const live = state.outcome === "succeeded" ? doneText : state.outcome === "failed" ? `Stopped: ${state.error ?? "the job failed."}` : running ? `${running.label}${running.detail ? ` — ${running.detail}` : ""}` : state.connection === "connecting" ? "Connecting…" : "Waiting for a worker";
  return (
    <div className={cn("rounded-sm border border-border-subtle bg-surface-raised p-3", className)} aria-busy={state.outcome === "running" || undefined}>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      <ol className="space-y-1.5">
        {state.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-sm">
            <StepIcon status={s.status} />
            <div className="min-w-0 flex-1">
              <div className={cn("leading-5", s.status === "pending" ? "text-muted" : "text-primary", s.status === "failed" && "text-danger")}>{s.label}</div>
              {s.detail && <div className={cn("text-xs", s.status === "failed" ? "text-danger" : "text-secondary")}>{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
      {state.outcome === "running" && !running && state.connection !== "connecting" && <p className="mt-2 text-xs text-muted">Queued. A worker picks it up within a few seconds; you can leave this page.</p>}
      {state.connection === "reconnecting" && state.outcome === "running" && <p className="mt-2 text-xs text-muted">Reconnecting…</p>}
    </div>
  );
}

function StepIcon({ status }: { status: JobStep["status"] }) {
  const cls = "mt-0.5 size-4 shrink-0";
  switch (status) {
    case "done":
      return <Check className={cn(cls, "text-success")} aria-label="Done" />;
    case "running":
      return <Loader2 className={cn(cls, "animate-spin text-accent")} aria-label="Running" />;
    case "failed":
      return <AlertCircle className={cn(cls, "text-danger")} aria-label="Failed" />;
    case "skipped":
      return <Minus className={cn(cls, "text-muted")} aria-label="Skipped" />;
    default:
      return <Circle className={cn(cls, "text-border-strong")} aria-label="Pending" />;
  }
}
