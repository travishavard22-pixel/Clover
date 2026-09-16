"use client";
import type { PreferencesDTO, PreferencesPatch } from "@/lib/settings/schema";
import { SettingRow, Switch } from "@/components/ui/switch";
import { Rows, Section } from "./section";

export function NotificationsSection({ prefs, update }: { prefs: PreferencesDTO; update: (patch: PreferencesPatch) => Promise<boolean> }) {
  return (
    <Section id="notifications" title="Notifications" description="What shows up in your Clover inbox. Automations respect these too: an automation set to notify stays quiet if the matching switch is off.">
      <Rows>
        <SettingRow label="New offers" description="A buyer made an offer, with Clover's take on it." control={<Switch checked={prefs.notifyOffers} onCheckedChange={(v) => void update({ notifyOffers: v })} aria-label="Notify about new offers" />} />
        <SettingRow label="Stale listings" description="Something has gone quiet and might need a new price or photos." control={<Switch checked={prefs.notifyStale} onCheckedChange={(v) => void update({ notifyStale: v })} aria-label="Notify about stale listings" />} />
        <SettingRow label="Publishing" description="A listing went live, needs a step from you, or failed." control={<Switch checked={prefs.notifyPublishing} onCheckedChange={(v) => void update({ notifyPublishing: v })} aria-label="Notify about publishing" />} />
        <SettingRow label="Also send by email" description="A daily digest. Nothing is emailed while this is off." control={<Switch checked={prefs.notifyEmail} onCheckedChange={(v) => void update({ notifyEmail: v })} aria-label="Also send notifications by email" />} />
      </Rows>
    </Section>
  );
}
