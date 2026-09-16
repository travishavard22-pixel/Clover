"use client";
import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import * as P from "@radix-ui/react-popover";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import type { DraftVersionDTO } from "@/lib/listings/store";
import { cn } from "@/lib/utils/cn";
import { errorMessage } from "./item-api";

const REASONS: Record<string, string> = { generated: "Generated", regenerated: "Regenerated", "user edit": "Edited by you", restore: "Restored" };

function reasonLabel(reason: string) {
  if (reason.startsWith("tone:")) return `Tool: ${reason.slice(5)}`;
  return REASONS[reason] ?? reason;
}

/** Every saved version of the draft, newest first, with one-tap restore (which itself becomes a version). */
export function VersionHistory({ currentVersion, load, onRestore }: { currentVersion: number; load: () => Promise<DraftVersionDTO[]>; onRestore: (version: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<DraftVersionDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setError(null);
    setVersions(null);
    load()
      .then(setVersions)
      .catch((err) => setError(errorMessage(err)));
  };

  const restore = async (v: number) => {
    setBusy(v);
    try {
      await onRestore(v);
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't restore", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <P.Root open={open} onOpenChange={openChange}>
      <P.Trigger asChild>
        <Button variant="ghost" size="sm" leadingIcon={<History className="size-4" aria-hidden />} aria-label={`Version history, currently version ${currentVersion}`}>
          v{currentVersion}
        </Button>
      </P.Trigger>
      <P.Portal>
        <P.Content align="end" sideOffset={6} className="z-50 w-80 rounded-sm border border-border-default bg-surface-floating p-2 shadow-float animate-fade-in">
          <h4 className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted">Versions</h4>
          {error ? (
            <p role="alert" className="px-2 py-2 text-sm text-danger">
              {error}
            </p>
          ) : versions === null ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {versions.map((v) => (
                <li key={v.version} className={cn("flex items-center gap-2 rounded-xs px-2 py-1.5 text-sm", v.version === currentVersion && "bg-surface-sunken")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-primary">
                      <span className="tabular font-medium">v{v.version}</span>
                      <span className="text-secondary">{reasonLabel(v.reason)}</span>
                    </div>
                    <div className="truncate text-xs text-muted">{new Date(v.createdAt).toLocaleString()} · {v.snapshot?.copy.title ?? "—"}</div>
                  </div>
                  {v.version !== currentVersion && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Restore version ${v.version}`} loading={busy === v.version} onClick={() => void restore(v.version)} disabled={!v.snapshot}>
                      <RotateCcw className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
