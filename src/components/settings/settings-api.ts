"use client";
import type { Capabilities } from "@/lib/env";
import type { JobStep } from "@/lib/jobs/types";
import type { ListingToEnd } from "@/lib/jobs/handlers/delete-account";
import type { ProfileDTO } from "@/lib/settings/prefs";
import type { PreferencesDTO, PreferencesPatch } from "@/lib/settings/schema";
import type { SessionDTO } from "@/lib/settings/sessions";
import type { ExportStatus } from "@/app/api/account/export/route";
import { apiRequest } from "@/lib/client/request";

export type { ExportStatus };

export const settingsApi = {
  load: () => apiRequest<{ profile: ProfileDTO; preferences: PreferencesDTO; capabilities: Capabilities }>("/api/settings"),
  updatePreferences: (preferences: PreferencesPatch) => apiRequest<{ profile: ProfileDTO; preferences: PreferencesDTO }>("/api/settings", { method: "PUT", json: { preferences } }),
  updateProfile: (name: string) => apiRequest<{ profile: ProfileDTO; preferences: PreferencesDTO }>("/api/settings", { method: "PUT", json: { profile: { name } } }),
  changePassword: (body: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean }) => apiRequest<{ ok: true }>("/api/settings/password", { method: "POST", json: body }),
  sessions: () => apiRequest<{ sessions: SessionDTO[] }>("/api/settings/sessions"),
  revokeSession: (id: string) => apiRequest<{ ok: true; current: boolean }>("/api/settings/sessions", { method: "DELETE", json: { id } }),
  exportStatus: () => apiRequest<ExportStatus>("/api/account/export"),
  startExport: () => apiRequest<{ jobId: string; steps: JobStep[]; reused: boolean }>("/api/account/export", { method: "POST" }),
  deleteAccount: () => apiRequest<{ jobId: string; steps: JobStep[]; listingsToEnd: ListingToEnd[]; reused: boolean }>("/api/account/delete", { method: "POST", json: { confirm: "DELETE" } }),
  deleteStatus: (jobId: string) => apiRequest<{ job: { id: string; status: string; steps: JobStep[]; error: string | null } }>(`/api/account/delete?jobId=${encodeURIComponent(jobId)}`),
};
