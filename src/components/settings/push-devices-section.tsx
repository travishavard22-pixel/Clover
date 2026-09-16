"use client";
import { useEffect, useState } from "react";
import { BellRing, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import type { PushDeviceDTO } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/lib/client/request";
import { TimeAgo } from "@/lib/client/time-ago";
import { nativeShell } from "@/lib/native/shell";
import { Rows, Section } from "./section";

const PLATFORM_LABEL: Record<PushDeviceDTO["platform"], string> = { ios: "iPhone or iPad", android: "Android", web: "Browser" };

/** The phones and desktops that receive push notifications for this account, with a way to remove one. */
export function PushDevicesSection({ pushConfigured }: { pushConfigured: boolean }) {
  const [devices, setDevices] = useState<PushDeviceDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inShell = typeof window !== "undefined" && nativeShell() === "capacitor";

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ devices: PushDeviceDTO[] }>("/api/push/devices")
      .then((r) => {
        if (!cancelled) setDevices(r.devices);
      })
      .catch(() => {
        if (!cancelled) setDevices([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (d: PushDeviceDTO) => {
    setBusy(d.id);
    try {
      await apiRequest("/api/push/devices", { method: "DELETE", json: { id: d.id } });
      setDevices((ds) => (ds ?? []).filter((x) => x.id !== d.id));
      toast.success("That device will no longer receive notifications.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the device."));
    } finally {
      setBusy(null);
    }
  };

  const description = !pushConfigured
    ? "Push delivery is not configured on this server yet, so alerts stay in the app. See the deployment guide to enable it."
    : inShell
      ? "This device registers for offers, listing updates and item alerts the first time you allow notifications."
      : "Install the Clover app on your phone to get offers and listing updates as notifications.";

  return (
    <Section id="devices" title="Push notifications" description={description}>
      <Rows>
        {devices === null ? (
          <p className="py-3 text-sm text-muted">Loading devices…</p>
        ) : devices.length === 0 ? (
          <p className="py-3 text-sm text-secondary">
            <BellRing className="mr-1.5 inline size-4 align-[-3px] text-muted" aria-hidden />
            No devices registered.
          </p>
        ) : (
          devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Smartphone className="size-5 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-primary">{PLATFORM_LABEL[d.platform]}</div>
                  <div className="mt-0.5 truncate text-xs text-secondary">
                    {d.deviceName ? `${d.deviceName.slice(0, 48)} · ` : ""}last seen <TimeAgo iso={d.lastSeenAt} />
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" leadingIcon={<X className="size-4" aria-hidden />} loading={busy === d.id} onClick={() => remove(d)}>
                Remove
              </Button>
            </div>
          ))
        )}
      </Rows>
    </Section>
  );
}
