"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JobEventKind, JobStep, StepStatus } from "@/lib/jobs/types";

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
 * The fold itself (`applyJobEvent`) is pure so it can be unit-tested without a browser.
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

export type JobEventBody = { seq?: number; stepKey?: string | null; message?: string; data?: Record<string, unknown> | null; at?: string };
export type JobSnapshotBody = { id: string; type?: string; status: string; steps?: JobStep[] };
export type JobEventName = "snapshot" | JobEventKind;

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
const MAX_LOGS = 50;

export function initialJobEventsState(opts: { initialSteps?: JobStep[]; initialStatus?: string | null } = {}): JobEventsState {
  const status = opts.initialStatus ?? null;
  return {
    connection: "idle",
    outcome: status === "SUCCEEDED" ? "succeeded" : status === "FAILED" || status === "CANCELLED" ? "failed" : "running",
    jobStatus: status,
    steps: opts.initialSteps ?? [],
    stepData: {},
    logs: [],
    error: status === "FAILED" || status === "CANCELLED" ? "The analysis stopped before finishing." : null,
    lastSeq: 0,
    lastEventAt: null,
  };
}

function setStep(steps: JobStepView[], key: string, patch: Partial<JobStepView>, labelFallback?: string): JobStepView[] {
  const idx = steps.findIndex((s) => s.key === key);
  if (idx === -1) return [...steps, { key, label: labelFallback ?? key, status: "pending" as StepStatus, ...patch }];
  return steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
}

function mergeData(state: JobEventsState, key: string, incoming: Record<string, unknown> | null | undefined) {
  const data = incoming ? { ...(state.stepData[key] ?? {}), ...incoming } : state.stepData[key];
  const stepData = data ? { ...state.stepData, [key]: data } : state.stepData;
  return { data, stepData };
}

function touch(state: JobEventsState, body: JobEventBody, now: number): JobEventsState {
  return { ...state, lastSeq: Math.max(state.lastSeq, body.seq ?? 0), lastEventAt: now };
}

/** Pure fold of one SSE event into the checklist state. `now` is injectable for tests. */
export function applyJobEvent(state: JobEventsState, name: JobEventName, body: JobEventBody | JobSnapshotBody | null, now = Date.now()): JobEventsState {
  if (name === "snapshot") {
    const snap = body as JobSnapshotBody | null;
    if (!snap) return state;
    const steps = Array.isArray(snap.steps) && snap.steps.length ? snap.steps.map((st) => ({ ...st, data: state.stepData[st.key] })) : state.steps;
    const next: JobEventsState = { ...state, connection: "open", jobStatus: snap.status, steps, lastEventAt: now };
    if (TERMINAL.has(snap.status)) {
      return { ...next, connection: "closed", outcome: snap.status === "SUCCEEDED" ? "succeeded" : "failed", error: snap.status === "SUCCEEDED" ? null : (state.error ?? "The analysis stopped before finishing.") };
    }
    return next;
  }

  const b = (body ?? {}) as JobEventBody;
  switch (name) {
    case "step_started": {
      if (!b.stepKey) return state;
      return touch({ ...state, steps: setStep(state.steps, b.stepKey, { status: "running", detail: undefined, startedAt: b.at }, b.message) }, b, now);
    }
    case "step_progress": {
      if (!b.stepKey) return state;
      const { data, stepData } = mergeData(state, b.stepKey, b.data);
      return touch({ ...state, stepData, steps: setStep(state.steps, b.stepKey, { status: "running", detail: b.message, data }) }, b, now);
    }
    case "step_finished": {
      if (!b.stepKey) return state;
      const { data, stepData } = mergeData(state, b.stepKey, b.data);
      return touch({ ...state, stepData, steps: setStep(state.steps, b.stepKey, { status: "done", detail: b.message, finishedAt: b.at, data }) }, b, now);
    }
    case "step_failed": {
      if (!b.stepKey) return state;
      return touch({ ...state, steps: setStep(state.steps, b.stepKey, { status: "failed", detail: b.message, finishedAt: b.at }) }, b, now);
    }
    case "step_skipped": {
      if (!b.stepKey) return state;
      return touch({ ...state, steps: setStep(state.steps, b.stepKey, { status: "skipped", detail: b.message, finishedAt: b.at }) }, b, now);
    }
    case "log": {
      const line: JobLogLine = { seq: b.seq ?? 0, message: b.message ?? "", at: b.at ?? new Date(now).toISOString(), data: b.data ?? undefined };
      return touch({ ...state, logs: [...state.logs.slice(-(MAX_LOGS - 1)), line] }, b, now);
    }
    case "job_finished":
      return touch({ ...state, jobStatus: "SUCCEEDED", outcome: "succeeded", error: null, connection: "closed" }, b, now);
    case "job_failed":
      return touch({ ...state, jobStatus: "FAILED", outcome: "failed", error: b.message ?? "The analysis failed.", connection: "closed" }, b, now);
    default:
      return state;
  }
}

const EVENT_NAMES: JobEventName[] = ["snapshot", "step_started", "step_progress", "step_finished", "step_failed", "step_skipped", "log", "job_finished", "job_failed"];

export function useJobEvents(jobId: string | null, opts: { initialSteps?: JobStep[]; initialStatus?: string | null } = {}) {
  const [state, setState] = useState<JobEventsState>(() => initialJobEventsState(opts));
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    let closed = false;
    const es = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
    sourceRef.current = es;
    setState((s) => (s.outcome === "running" ? { ...s, connection: "connecting" } : s));

    const parse = (e: Event): JobEventBody | JobSnapshotBody | null => {
      try {
        return JSON.parse((e as MessageEvent).data) as JobEventBody | JobSnapshotBody;
      } catch {
        return null;
      }
    };

    es.onopen = () => setState((s) => (s.connection === "closed" ? s : { ...s, connection: "open" }));
    es.onerror = () => {
      if (closed) return;
      setState((s) => (s.outcome === "running" ? { ...s, connection: "reconnecting" } : s));
    };

    const handlers = EVENT_NAMES.map((name) => {
      const handler = (e: Event) => {
        const body = parse(e);
        setState((s) => {
          const next = applyJobEvent(s, name, body);
          if (next.outcome !== "running" && !closed) {
            closed = true;
            es.close();
          }
          return next;
        });
      };
      es.addEventListener(name, handler);
      return [name, handler] as const;
    });

    return () => {
      closed = true;
      for (const [name, handler] of handlers) es.removeEventListener(name, handler);
      es.close();
      sourceRef.current = null;
    };
    // The initial steps/status only seed the very first render; the stream is the source of truth after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return useMemo(() => state, [state]);
}
