"use client";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { ExportDataCard } from "./export-data-card";
import { Rows, Section } from "./section";
import type { ExportStatus } from "./settings-api";

export function PrivacySection({ exportStatus, email, itemCount }: { exportStatus: ExportStatus; email: string; itemCount: number }) {
  return (
    <Section id="privacy" title="Privacy and data" description="Your data is yours. Take a copy any time, or remove everything. Both run as jobs you can watch.">
      <Rows>
        <ExportDataCard initial={exportStatus} />
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-primary">Delete my account</div>
            <p className="mt-0.5 text-sm text-secondary">Removes your account and everything in it, revokes marketplace connections, and deletes every stored photo and export. Listings already on marketplaces stay live until you end them.</p>
          </div>
          <DeleteAccountDialog email={email} itemCount={itemCount} />
        </div>
      </Rows>
      <p className="mt-3 text-xs text-muted">What Clover keeps and why is summarised in Help → Privacy. Marketplace tokens are encrypted at rest and never exported.</p>
    </Section>
  );
}
