"use client";
import { useEffect, useState } from "react";
import type { Capabilities } from "@/lib/env";
import type { ProfileDTO } from "@/lib/settings/prefs";
import type { PreferencesDTO } from "@/lib/settings/schema";
import type { SessionDTO } from "@/lib/settings/sessions";
import { Page, PageHeader } from "@/components/layout/page-header";
import { DemoBadge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectionsSection, type ConnectionSummary } from "./connections-section";
import { NotificationsSection } from "./notifications-section";
import { PrivacySection } from "./privacy-section";
import { ProfileSection } from "./profile-section";
import { ProvidersSection } from "./providers-section";
import { SellingSection } from "./selling-section";
import { SessionsSection } from "./sessions-section";
import type { ExportStatus } from "./settings-api";
import { usePreferences } from "./use-preferences";

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "selling", label: "Selling" },
  { value: "notifications", label: "Notifications" },
  { value: "providers", label: "Providers" },
  { value: "privacy", label: "Privacy & data" },
  { value: "connections", label: "Marketplaces" },
  { value: "sessions", label: "Sessions" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

export type SettingsPageProps = {
  profile: ProfileDTO;
  preferences: PreferencesDTO;
  capabilities: Capabilities;
  sessions: SessionDTO[];
  connections: ConnectionSummary[];
  exportStatus: ExportStatus;
  itemCount: number;
  initialTab?: string;
};

/**
 * Tabs on desktop; on phones every section is stacked. Radix keeps every panel mounted
 * (`forceMount`, so form state survives tab switches) and inactive panels are hidden only from `md` up.
 */
export function SettingsPage(props: SettingsPageProps) {
  const { prefs, update } = usePreferences(props.preferences);
  const [tab, setTab] = useState<TabValue>(TABS.some((t) => t.value === props.initialTab) ? (props.initialTab as TabValue) : "profile");

  useEffect(() => {
    const url = tab === "profile" ? "/settings" : `/settings?tab=${tab}`;
    window.history.replaceState(window.history.state, "", url);
  }, [tab]);

  const panels: Record<TabValue, React.ReactNode> = {
    profile: <ProfileSection profile={props.profile} />,
    selling: <SellingSection prefs={prefs} update={update} />,
    notifications: <NotificationsSection prefs={prefs} update={update} />,
    providers: <ProvidersSection capabilities={props.capabilities} />,
    privacy: <PrivacySection exportStatus={props.exportStatus} email={props.profile.email} itemCount={props.itemCount} />,
    connections: <ConnectionsSection connections={props.connections} />,
    sessions: <SessionsSection sessions={props.sessions} />,
  };

  return (
    <Page>
      <PageHeader eyebrow="Settings" title="Settings" description="Your profile, how you sell, what Clover tells you, and what this installation can do." actions={props.capabilities.demoMode || !props.capabilities.ai ? <DemoBadge /> : undefined} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <div className="mb-6 hidden md:block">
          <TabsList aria-label="Settings sections">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="space-y-10 md:space-y-0">
          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} forceMount className="outline-none md:data-[state=inactive]:hidden">
              {panels[t.value]}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </Page>
  );
}
