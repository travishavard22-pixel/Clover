"use client";

/**
 * Detection and small adapters for the native shells that wrap the hosted web app: Capacitor on
 * iOS and Android, Tauri on desktop. The shells load the same origin as the browser does, so
 * cookies, auth and every API call work unchanged; only a few platform features differ.
 */

export type Shell = "capacitor" | "tauri" | null;

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function nativeShell(): Shell {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Capacitor?: CapacitorGlobal; __TAURI_INTERNALS__?: unknown };
  if (w.Capacitor?.isNativePlatform?.()) return "capacitor";
  if (w.__TAURI_INTERNALS__) return "tauri";
  return null;
}

export function nativePlatform(): "ios" | "android" | "desktop" | "web" {
  const shell = nativeShell();
  if (shell === "tauri") return "desktop";
  if (shell === "capacitor") {
    const p = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.getPlatform?.();
    return p === "ios" ? "ios" : p === "android" ? "android" : "web";
  }
  return "web";
}

function webCanShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof File === "undefined" || !navigator.canShare) return false;
  try {
    const probe = new File([new Uint8Array([0])], "probe.zip", { type: "application/zip" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** True when the share sheet can take a file: the web share API with files, or the Capacitor share plugin. */
export async function canShareFiles(): Promise<boolean> {
  if (webCanShareFiles()) return true;
  if (nativeShell() !== "capacitor") return false;
  try {
    const { Share } = await import("@capacitor/share");
    return (await Share.canShare()).value;
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/**
 * Hands a file to the platform share sheet. Prefers the web share API (Safari on iOS supports
 * files); falls back to the Capacitor plugin, which writes the file to the app cache first
 * because Android's WebView cannot share blobs directly.
 */
export async function shareFile(input: { blob: Blob; name: string; title: string }): Promise<"shared" | "cancelled"> {
  if (webCanShareFiles()) {
    try {
      await navigator.share({ files: [new File([input.blob], input.name, { type: input.blob.type })], title: input.title });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      if (nativeShell() !== "capacitor") throw err;
      // fall through to the plugin
    }
  }
  if (nativeShell() !== "capacitor") throw new Error("Sharing files is not supported here. Download the file instead.");
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const written = await Filesystem.writeFile({ path: input.name, data: await blobToBase64(input.blob), directory: Directory.Cache });
  try {
    await Share.share({ title: input.title, files: [written.uri] });
    return "shared";
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return "cancelled";
    throw err;
  }
}
