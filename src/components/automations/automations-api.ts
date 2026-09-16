"use client";
import type { AutomationMode, AutomationType } from "@/lib/db";
import type { AutomationDefinition, ResolvedRule } from "@/lib/automations";
import type { AutomationActivity, RecommendationDTO } from "@/lib/automations/recommendations";
import type { ApplyResult } from "@/lib/automations/apply";
import type { JobStep } from "@/lib/jobs/types";
import { apiRequest } from "@/lib/client/request";

export type LastRun = { id: string; status: string; steps: unknown; result: unknown; createdAt: string; finishedAt: string | null } | null;
export type AutomationsPayload = { rules: ResolvedRule[]; registry: AutomationDefinition[]; activity: Record<AutomationType, AutomationActivity[]>; lastRun: LastRun };

export const automationsApi = {
  load: () => apiRequest<AutomationsPayload>("/api/automations"),
  updateRule: (type: AutomationType, patch: { mode?: AutomationMode; config?: Record<string, unknown> }) => apiRequest<{ rules: ResolvedRule[] }>("/api/automations", { method: "PUT", json: { type, ...patch } }),
  run: () => apiRequest<{ jobId: string; steps: JobStep[]; reused: boolean }>("/api/automations/run", { method: "POST" }),
  recommendations: (status: string[] = ["OPEN", "SNOOZED"]) => apiRequest<{ recommendations: RecommendationDTO[] }>(`/api/recommendations?status=${status.join(",")}`),
  apply: (id: string) => apiRequest<{ recommendation: RecommendationDTO; result: ApplyResult }>(`/api/recommendations/${encodeURIComponent(id)}/apply`, { method: "POST" }),
  dismiss: (id: string) => apiRequest<{ recommendation: RecommendationDTO }>(`/api/recommendations/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
  snooze: (id: string, days: number) => apiRequest<{ recommendation: RecommendationDTO }>(`/api/recommendations/${encodeURIComponent(id)}/snooze`, { method: "POST", json: { days } }),
};
