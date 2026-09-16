"use client";
import Link from "next/link";
import { Camera, Upload, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { SHOT_GUIDE } from "./shot-guide";
import { ShutterButton } from "./shutter-button";

/**
 * Value before permission: what a scan is and what comes out of it, shown before the browser asks
 * for the camera. The shutter is already on screen; pressing it (or "Enable camera") is the ask.
 */
export function CaptureIntro({ onEnable, uploadHref, closeHref, starting }: { onEnable: () => void; uploadHref: string; closeHref: string; starting: boolean }) {
  return (
    <div className="relative flex size-full flex-col">
      <div className="flex h-14 items-center px-3">
        <Link href={closeHref} className={buttonClasses("ghost", "icon")} aria-label="Close">
          <X className="size-5" />
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full border border-border-default text-primary">
          <Camera className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="max-w-sm">
          <h1 className="serif-display text-4xl text-primary sm:text-5xl">Scan an item</h1>
          <p className="mt-3 text-base text-secondary">Take two to four photos. Clover identifies the item, checks what similar ones sold for, drafts the listing and keeps your originals untouched.</p>
        </div>
        <ol className="grid w-full max-w-sm grid-cols-2 gap-2 text-left" aria-label="Suggested shots">
          {SHOT_GUIDE.map((s, i) => (
            <li key={s.label} className="rounded-sm border border-border-subtle bg-surface-raised px-3 py-2.5">
              <div className="text-sm font-medium text-primary">
                <span className="mr-1.5 tabular text-muted">{i + 1}</span>
                {s.label}
              </div>
              <div className="mt-0.5 text-xs text-secondary">{s.hint}</div>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col items-center gap-4 px-6 pb-8 safe-bottom">
        <ShutterButton onCapture={onEnable} disabled={starting} busy={starting} label="Enable camera and start scanning" />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" onClick={onEnable} loading={starting} leadingIcon={<Camera className="size-4" />}>
            Enable camera
          </Button>
          <Link href={uploadHref} className={buttonClasses("ghost", "md")}>
            <Upload className="size-4" aria-hidden /> Upload photos instead
          </Link>
        </div>
        <p className="text-xs text-muted">Your browser will ask for camera access once. Nothing is recorded; only the photos you take are kept.</p>
      </div>
    </div>
  );
}
