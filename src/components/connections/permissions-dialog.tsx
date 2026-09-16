"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** "View permissions": every scope Clover asks for, in plain language, with the raw scope for the curious. */
export function PermissionsDialog({ marketplaceName, scopes, connected }: { marketplaceName: string; scopes: Array<{ scope: string; label: string }>; connected: boolean }) {
  const [open, setOpen] = useState(false);
  if (scopes.length === 0) return null;
  return (
    <>
      <Button variant="link" size="sm" onClick={() => setOpen(true)} leadingIcon={<ShieldCheck className="size-4" aria-hidden />}>
        View permissions
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" title={`${marketplaceName} permissions`} description={connected ? `What you granted Clover on ${marketplaceName}. Disconnecting removes all of it.` : `What Clover will ask ${marketplaceName} for when you connect.`}>
          <ul className="divide-y divide-border-subtle">
            {scopes.map((s) => (
              <li key={s.scope} className="py-3">
                <p className="text-sm text-primary">{s.label}</p>
                <p className="mt-0.5 break-all font-mono text-[11px] text-muted">{s.scope}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-secondary">Clover never asks for permissions it does not use, and stores tokens encrypted.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
