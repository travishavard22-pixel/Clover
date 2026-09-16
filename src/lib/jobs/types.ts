import type { JobType } from "../db";

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type JobStep = {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type JobEventKind =
  | "step_started"
  | "step_progress"
  | "step_finished"
  | "step_failed"
  | "step_skipped"
  | "log"
  | "job_finished"
  | "job_failed";

export type JobEventPayload = {
  kind: JobEventKind;
  stepKey?: string;
  message: string;
  data?: Record<string, unknown>;
};

export type JobRecord = {
  id: string;
  type: JobType;
  userId: string | null;
  itemId: string | null;
  payload: Record<string, unknown>;
  steps: JobStep[];
  attempts: number;
};

export interface JobContext<P = Record<string, unknown>> {
  job: JobRecord;
  payload: P;
  /** Run a named step. Status lines should name the action and the object, e.g. "Searching eBay for comparable listings". */
  step<T>(key: string, label: string, fn: (report: (detail: string, data?: Record<string, unknown>) => Promise<void>) => Promise<T>): Promise<T>;
  skip(key: string, label: string, reason: string): Promise<void>;
  log(message: string, data?: Record<string, unknown>): Promise<void>;
  signal: AbortSignal;
}

export type JobHandler<P = Record<string, unknown>, R = unknown> = (ctx: JobContext<P>) => Promise<R>;

export class JobRetryableError extends Error {
  constructor(message: string, public delayMs = 5000) {
    super(message);
    this.name = "JobRetryableError";
  }
}
