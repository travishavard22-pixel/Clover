import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";
import { db } from "@/lib/db";
import { publicCapabilities } from "@/lib/env";
import { EXPORT_LINK_TTL_SECONDS, type ExportDataResult } from "@/lib/jobs/handlers/export-data";
import { requireUser, getSession } from "@/lib/session";
import { getPreferences, getProfile, listUserSessions } from "@/lib/settings";
import { signedFileUrl, storage } from "@/lib/storage";
import type { ExportStatus } from "@/app/api/account/export/route";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

async function exportStatus(userId: string): Promise<ExportStatus> {
  const [latest, lastDone] = await Promise.all([
    db.job.findFirst({ where: { userId, type: "EXPORT_DATA" }, orderBy: { createdAt: "desc" } }),
    db.job.findFirst({ where: { userId, type: "EXPORT_DATA", status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } }),
  ]);
  const result = lastDone?.result as ExportDataResult | null | undefined;
  const exists = lastDone && result?.key && result.key.startsWith(`users/${userId}/`) ? await storage.exists(result.key) : false;
  return {
    job: latest ? { id: latest.id, status: latest.status, steps: latest.steps, error: latest.error, createdAt: latest.createdAt.toISOString(), finishedAt: latest.finishedAt?.toISOString() ?? null } : null,
    download:
      exists && lastDone && result
        ? { url: signedFileUrl(result.key, EXPORT_LINK_TTL_SECONDS, false), bytes: result.bytes, expiresAt: new Date(Date.now() + EXPORT_LINK_TTL_SECONDS * 1000).toISOString(), createdAt: (lastDone.finishedAt ?? lastDone.createdAt).toISOString(), counts: result.counts }
        : null,
  };
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const user = await requireUser();
  const [q, session, profile, preferences, connections, itemCount, exp] = await Promise.all([
    searchParams,
    getSession(),
    getProfile(user.id),
    getPreferences(user.id),
    db.marketplaceConnection.findMany({ where: { userId: user.id }, select: { marketplace: true, status: true, mode: true, externalAccountName: true }, orderBy: { marketplace: "asc" } }),
    db.item.count({ where: { userId: user.id } }),
    exportStatus(user.id),
  ]);
  const sessions = await listUserSessions(user.id, session?.session.token ?? null);
  return (
    <SettingsPage
      profile={profile}
      preferences={preferences}
      capabilities={publicCapabilities()}
      sessions={sessions}
      connections={connections.map((c) => ({ marketplace: c.marketplace, status: c.status, mode: c.mode, accountName: c.externalAccountName }))}
      exportStatus={exp}
      itemCount={itemCount}
      initialTab={Array.isArray(q.tab) ? q.tab[0] : q.tab}
    />
  );
}
