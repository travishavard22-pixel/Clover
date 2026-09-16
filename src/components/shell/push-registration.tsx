"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { nativePlatform, nativeShell } from "@/lib/native/shell";
import { apiRequest } from "@/lib/client/request";

const TOKEN_KEY = "clover:push-token";

/** Removes this device's push registration; called before signing out so a shared phone stops receiving alerts. */
export async function unregisterThisDevice(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    return;
  }
  if (!token) return;
  try {
    await apiRequest("/api/push/devices", { method: "DELETE", json: { token } });
  } catch {
    // best effort — the server prunes dead tokens on the next delivery attempt
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Inside the phone apps: asks for notification permission once, registers the device token with
 * the account, and opens the right screen when a notification is tapped. Renders nothing, and
 * does nothing at all in a normal browser.
 */
export function PushRegistration() {
  const router = useRouter();
  useEffect(() => {
    if (nativeShell() !== "capacitor") return;
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        let status = await PushNotifications.checkPermissions();
        if (status.receive === "prompt" || status.receive === "prompt-with-rationale") status = await PushNotifications.requestPermissions();
        if (status.receive !== "granted" || cancelled) return;
        handles.push(
          await PushNotifications.addListener("registration", async ({ value }) => {
            try {
              await apiRequest("/api/push/devices", { method: "POST", json: { token: value, platform: nativePlatform(), deviceName: navigator.userAgent.slice(0, 80) } });
              localStorage.setItem(TOKEN_KEY, value);
            } catch {
              // registration is retried on the next launch
            }
          }),
        );
        handles.push(
          await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
            const href = typeof notification.data?.href === "string" ? notification.data.href : "/notifications";
            router.push(href.startsWith("/") ? href : "/notifications");
          }),
        );
        if (nativePlatform() === "android") {
          await PushNotifications.createChannel({ id: "clover", name: "Clover", description: "Offers, listings and item updates", importance: 4, visibility: 1 });
        }
        await PushNotifications.register();
      } catch (err) {
        console.warn("[push] registration skipped", err);
      }
    })();
    return () => {
      cancelled = true;
      for (const h of handles) void h.remove();
    };
  }, [router]);
  return null;
}
