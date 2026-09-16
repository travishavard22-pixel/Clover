"use client";
import Link from "next/link";
import { Camera, CameraOff, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import type { CameraStatus } from "./use-camera";

/** No camera, permission denied, or a hardware error: explain plainly and keep the seller moving. */
export function CaptureFallback({ status, error, onRetry, onDeviceCamera, uploadHref, closeHref, shotsTaken, onContinue }: { status: CameraStatus; error: string | null; onRetry: () => void; onDeviceCamera: () => void; uploadHref: string; closeHref: string; shotsTaken: number; onContinue: () => void }) {
  const denied = status === "denied";
  const title = denied ? "Camera access is off" : "No camera available here";
  const body = denied
    ? "Your browser blocked the camera for this site. You can allow it again in the site settings (the icon next to the address), or carry on without it."
    : (error ?? "This device or browser does not expose a camera to web pages.") + " You can still sell — use your device's camera app or upload photos you already have.";
  return (
    <div className="relative flex size-full flex-col">
      <div className="flex h-14 items-center px-3">
        <Link href={closeHref} className={buttonClasses("ghost", "icon")} aria-label="Close">
          <X className="size-5" />
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center" role="status">
        <span className="flex size-14 items-center justify-center rounded-full border border-border-default text-secondary">
          <CameraOff className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="max-w-sm">
          <h1 className="text-2xl font-semibold text-primary">{title}</h1>
          <p className="mt-3 text-base text-secondary">{body}</p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button size="lg" onClick={onDeviceCamera} leadingIcon={<Camera className="size-5" />}>
            Use device camera
          </Button>
          <Link href={uploadHref} className={buttonClasses("outline", "lg")}>
            <Upload className="size-5" aria-hidden /> Upload photos instead
          </Link>
          {denied && (
            <Button variant="ghost" onClick={onRetry} leadingIcon={<RefreshCw className="size-4" />}>
              Try the camera again
            </Button>
          )}
          {shotsTaken > 0 && (
            <Button variant="ghost" onClick={onContinue}>
              Continue with the {shotsTaken} {shotsTaken === 1 ? "photo" : "photos"} I have
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
