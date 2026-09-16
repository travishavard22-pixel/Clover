"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JobStep, StepStatus } from "@/lib/jobs/types";

/**
 * Subscribes to `GET /api/jobs/[id]/events` (Server-Sent Events) and folds the stream into a
 * step checklist. Every state here comes from a real worker event: nothing is simulated.
 *
 * Events (see src/app/api/jobs/[id]/events/route.ts):
 *  snapshot       { id, type?, status, steps }        — sent on connect and again when the job ends
 *  step_started   { seq, stepKey, message }
 *  step_progress  { seq, stepKey, message, data? }    — message is the live detail line
 *  step_finished  { seq, stepKey, message, data? }
 *  step_failed    { seq, stepKey, message }
 *  step_skipped   { seq, stepKey, message }           — message is the reason
 *  log            { seq, message, data? }
 *  job_finished   { seq, message }
 *  job_failed     { seq, message }
 *
 * EventSource reconnects on its own with Last-Event-ID; the route replays what was missed.
 */

export type JobStepView = JobStep & { data?: Record<string, unknown> };
export type JobConnection = "idle" | "connecting" | "open" | "reconnecting" | "closed";
export type JobOutcome = "running" | "succeeded" | "failed";
export type JobLogLine = { seq: number; message: string; at: string; data?: Record<string, unknown> };

export type JobEventsState = {
  connection: JobConnection;
  outcome: JobOutcome;
  jobStatus: string | null;
  steps: JobStepView[];
  /** Data reported by the worker, merged per step key (from step_progress and step_finished). */
  stepData: Record<string, Record<string, unknown>>;
  logs: JobLogLine[];
  error: string | null;
  /** Sequence number of the last event applied (for debugging / tests). */
  lastSeq: number;
  /** Time of the last event of any kind; drives the "taking longer than usual" note. */
  lastEventAt: number | null;
};

type EventBody = { seq?: number; stepKey?: string | null; message?: string; data?: Record<string, unknown> | null; at?: string };
type SnapshotBody = { id: string; type?: string; status: string; steps?: JobStep[] };

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

function initial(): JobEventsState {
  return { connection: "idle", outcome: "running", jobStatus: null, steps: [], stepData: {}, logs: [], error: null, lastSeq: 0, lastEventAt: null };
}

function setStep(steps: JobStepView[], key: string, patch: Partial<JobStepView>, labelFallback?: string): JobStepView[] {
  const idx = steps.findIndex((s) => s.key === key);
  if (idx === -1) return [...steps, { key, label: labelFallback ?? key, status: "pending" as StepStatus, ...patch }];
  return steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
}

export function useJobEvents(jobId: string | null, opts: { initialSteps?: JobStep[]; initialStatus?: string | null } = {}) {
  const [state, setState] = useState<JobEventsState>(() => ({
    ...initial(),
    steps: opts.initialSteps ?? [],
    jobStatus: opts.initialStatus ?? null,
    outcome: opts.initialStatus === "SUCCEEDED" ? "succeeded" : opts.initialStatus === "FAILED" ? "failed" : "running",
  }));
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    let closed = false;
    const es = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
    sourceRef.current = es;
    setState((s) => ({ ...s, connection: "connecting", error: null }));

    const parse = <T,>(e: MessageEvent): T | null => {
      try {
        return JSON.parse(e.data) as T;
      } catch {
        return null;
      }
    };
    const finish = (outcome: JobOutcome, error: string | null) => {
      closed = true;
      es.close();
      setState((s) => ({ ...s, outcome, error, connection: "closed" }));
    };
    const touch = (s: JobEventsState, body: EventBody): JobEventsState => ({ ...s, lastSeq: body.seq ?? s.lastSeq, lastEventAt: Date.now() });

    es.onopen = () => setState((s) => ({ ...s, connection: "open" }));
    es.onerror = () => {
      if (closed) return;
      setState((s) => (s.outcome === "running" ? { ...s, connection: "reconnecting" } : s));
    };

    es.addEventListener("snapshot", (e) => {
      const body = parse<SnapshotBody>(e as MessageEvent);
      if (!body) return;
      setState((s) => ({ ...s, connection: "open", jobStatus: body.status, steps: Array.isArray(body.steps) && body.steps.length ? body.steps.map((st) => ({ ...st, data: s.stepData[st.key] })) : s.steps, lastEventAt: Date.now() }));
      if (TERMINAL.has(body.status)) finish(body.status === "SUCCEEDED" ? "succeeded" : "failed", body.status === "SUCCEEDED" ? null : "The analysis stopped before finishing.");
    });

    es.addEventListener("step_started", (e) => {
      const b = parse<EventBody>(e as MessageEvent);
      if (!b?.stepKey) return;
      setState((s) => touch({ ...s, steps: setStep(s.steps, b.stepKey!, { status: "running", detail: undefined, startedAt: b.at }, b.message) }, b));
    });
    es.addEventListener("step_progress", (e) => {
      const b = parse<EventBody>(e as MessageEvent);
      if (!b?.stepKey) return;
      setState((s) => {
        const data = b.data ? { ...(s.stepData[b.stepKey!] ?? {}), ...b.data } : s.stepData[b.stepKey!];
        const stepData = data ? { ...s.stepData, [b.stepKey!]: data } : s.stepData;
        return touch({ ...s, stepData, steps: setStep(s.steps, b.stepKey!, { status: "running", detail: b.message, data }) }, b);
      });
    });
    es.addEventListener("step_finished", (e) => {
      const b = parse<EventBody>(e as MessageEvent);
      if (!b?.stepKey) return;
      setState((s) => {
        const data = b.data ? { ...(s.stepData[b.stepKey!] ?? {}), ...b.data } : s.stepData[b.stepKey!];
        const stepData = data ? { ...s.stepData, [b.stepKey!]: data } : s.stepData;
        return touch({ ...s, stepData, steps: setStep(s.steps, b.stepKey!, { status: "done", detail: b.message, finishedAt: b.at, data }) }, b);
      });
    });
    es.addEventListener("step_failed", (e) => {
      const b = parse<EventBody>(e as MessageEvent);
      if (!b?.stepKey) return;
      setState((s) => touch({ ...s, steps: setStep(s.steps, b.stepKey!, { status: "failed", detail: b.message, finishedAt: b.at }) }, b));
    });
    es.addEventListener("step_skipped", (e) => {
      const b = parse<EventBody>(e as MessageEvent);
      if (!b?.stepKey) return;
      setState((s) => touch({ ...s, steps: setStep(s.steps, b.stepKey!, { status: "skipped", detail: b.message, finishedAt: b.at }) }, b));
    });
    es.addEventListener("log", (e) => {
      const b = parse<EventBody>(e as MessageEvent);
      if (!b) return;
      setState((s) => touch({ ...s, logs: [...s.logs.slice(-49), { seq: b.seq ?? 0, message: b.message ?? "", at: b.at ?? new Date().toISOString(), data: b.data ?? undefined }] }, b));
    });
    es.addEventListener("job_finished", (e) => {
      const b = parse<EventBody>(e as MessageEvent);
      setState((s) => touch({ ...s, jobStatus: "SUCCEEDED" }, b ?? {}));
      finish("succeeded", null);
    });
    es.addEventListener("job_failed", (e) => {
      const b = parse<EventBody>(e as MessageEvent);
      setState((s) => touch({ ...s, jobStatus: "FAILED" }, b ?? {}));
      finish("failed", b?.message ?? "The analysis failed.");
    });

    return () => {
      closed = true;
      es.close();
      sourceRef.current = null;
    };
  }, [jobId]);

  return useMemo(() => state, [state]);
}
