"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { JobStep } from "@/lib/jobs/types";
import type { ListingToEnd } from "@/lib/jobs/handlers/delete-account";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { signOut } from "@/lib/auth-client";
import { ApiRequestError, errorMessage } from "@/lib/client/request";
import { GoodbyeScreen } from "./goodbye-screen";
import { settingsApi } from "./settings-api";

type Phase = { kind: "confirm" } | { kind: "running"; jobId: string; steps: JobStep[]; listings: ListingToEnd[] } | { kind: "failed"; error: string } | { kind: "gone"; listings: ListingToEnd[] };

/**
 * Type-to-confirm, then a real job. The job is not owned by the user (it must outlive the account),
 * so progress is polled from a status endpoint; a 401 means the account is gone, which is the
 * success signal. Then we sign out and show the goodbye screen.
 */
export function DeleteAccountDialog({ email, itemCount }: { email: string; itemCount: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "confirm" });
  const listingsRef = useRef<ListingToEnd[]>([]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await settingsApi.deleteAccount();
      listingsRef.current = r.listingsToEnd;
      setPhase({ kind: "running", jobId: r.jobId, steps: r.steps, listings: r.listingsToEnd });
    } catch (err) {
      setPhase({ kind: "failed", error: errorMessage(err, "Could not start the deletion.") });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (phase.kind !== "running") return;
    let cancelled = false;
    const finish = async () => {
      try {
        await signOut();
      } catch {
        // the session is already invalid once the user row is gone
      }
      if (!cancelled) setPhase({ kind: "gone", listings: listingsRef.current });
    };
    const tick = async () => {
      try {
        const { job } = await settingsApi.deleteStatus(phase.jobId);
        if (cancelled) return;
        setPhase((p) => (p.kind === "running" ? { ...p, steps: job.steps } : p));
        if (job.status === "SUCCEEDED") return void finish();
        if (job.status === "FAILED" || job.status === "CANCELLED") return setPhase({ kind: "failed", error: job.error ?? "The deletion job failed. Your account is still here." });
      } catch (err) {
        if (cancelled) return;
        // 401/404 once the user row is gone = the account was deleted.
        if (err instanceof ApiRequestError && (err.status === 401 || err.status === 404)) return void finish();
        // transient — keep polling
      }
      timer = window.setTimeout(tick, 1000);
    };
    let timer = window.setTimeout(tick, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase.kind, phase.kind === "running" ? phase.jobId : null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase.kind === "gone") return <GoodbyeScreen listings={phase.listings} />;

  const canDelete = typed === "DELETE" && !busy;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (phase.kind === "running") return; // don't let the dialog close while the job runs
        setOpen(o);
        if (!o) {
          setTyped("");
          setPhase({ kind: "confirm" });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="danger" leadingIcon={<Trash2 className="size-4" aria-hidden />} className="shrink-0">
          Delete my account
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete your account?" description="This removes your account, items, photos, listings records, offers, conversations and marketplace connections. It cannot be undone." size="md">
        {phase.kind === "running" ? (
          <div className="space-y-3" aria-live="polite">
            <p className="text-sm text-primary">Deleting {email}…</p>
            <ol className="space-y-1.5 text-sm">
              {phase.steps.map((s) => (
                <li key={s.key} className={s.status === "done" ? "text-primary" : s.status === "running" ? "text-accent-text" : "text-muted"}>
                  {s.status === "done" ? "✓" : s.status === "running" ? "…" : "○"} {s.label}
                  {s.detail && <span className="block pl-4 text-xs text-secondary">{s.detail}</span>}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted">Keep this page open; you&apos;ll be signed out when it finishes.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-sm bg-danger-soft p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p>
                  {itemCount} item{itemCount === 1 ? "" : "s"} and every photo will be deleted from Clover&apos;s storage.
                </p>
                <p className="mt-1">Clover cannot end listings on marketplaces for you once the account is gone. Live listings are shown after deletion so you can end them yourself.</p>
              </div>
            </div>
            <p className="text-sm text-secondary">Want a copy first? Use “Export my data” above and wait for the link before deleting.</p>
            <Field label={`Type DELETE to confirm`} hint="Capital letters, exactly as shown.">
              {(p) => <Input {...p} value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} className="font-mono" />}
            </Field>
            {phase.kind === "failed" && (
              <p role="alert" className="text-sm text-danger">
                {phase.error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <DialogClose asChild>
                <Button variant="ghost" type="button">
                  Keep my account
                </Button>
              </DialogClose>
              <Button variant="danger" disabled={!canDelete} loading={busy} onClick={start}>
                Delete everything
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
