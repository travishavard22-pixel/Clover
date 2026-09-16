"use client";
import { useState } from "react";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SessionDTO } from "@/lib/settings/sessions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/client/request";
import { TimeAgo } from "@/lib/client/time-ago";
import { Rows, Section } from "./section";
import { settingsApi } from "./settings-api";

export function SessionsSection({ sessions: initial }: { sessions: SessionDTO[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const revoke = async (s: SessionDTO) => {
    setBusy(s.id);
    try {
      const r = await settingsApi.revokeSession(s.id);
      if (r.current) {
        router.push("/sign-in");
        router.refresh();
        return;
      }
      setSessions((ss) => ss.filter((x) => x.id !== s.id));
      toast.success(`Signed out ${s.device}.`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not sign out that device."));
    } finally {
      setBusy(null);
    }
  };

  const others = sessions.filter((s) => !s.current);

  return (
    <Section id="sessions" title="Sessions" description="Every device signed in to your account. Sign out anything you don't recognise.">
      <Rows>
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <MonitorSmartphone className="size-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
                  {s.device}
                  {s.current && <Badge tone="accent">This device</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-secondary">
                  {s.ipAddress ? `${s.ipAddress} · ` : ""}active <TimeAgo iso={s.updatedAt} /> · expires {new Date(s.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            </div>
            <Button size="sm" variant={s.current ? "ghost" : "outline"} leadingIcon={<LogOut className="size-4" aria-hidden />} loading={busy === s.id} onClick={() => revoke(s)}>
              {s.current ? "Sign out" : "Sign out device"}
            </Button>
          </div>
        ))}
        {others.length > 1 && (
          <div className="py-3 text-right">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={async () => {
                for (const s of others) await revoke(s);
              }}
            >
              Sign out all other devices
            </Button>
          </div>
        )}
      </Rows>
    </Section>
  );
}
