"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, SwitchCamera, X, Zap, ZapOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { visiblePhotos } from "@/lib/photos/order";
import { ACCEPT_ATTRIBUTE, checkClientFile } from "@/lib/photos/mime";
import { cn } from "@/lib/utils/cn";
import { CaptureFallback } from "./capture-fallback";
import { CaptureIntro } from "./capture-intro";
import { CaptureTray } from "./capture-tray";
import { darkScope } from "./dark-scope";
import { FramingGuide } from "./framing-guide";
import { guideFor, MAX_SHOTS } from "./shot-guide";
import { ShotGuideChips } from "./shot-guide-chips";
import { ShotSheet } from "./shot-sheet";
import { makeShot, measureFile, relabelSequential, releaseShot, type Shot } from "./shots";
import { ShutterButton } from "./shutter-button";
import { createItem, listPhotos, uploadBatch } from "./upload-client";
import { UploadProgress, type UploadRow } from "./upload-progress";
import { useCamera } from "./use-camera";

type Phase = "intro" | "camera" | "fallback" | "uploading";
type Flyer = { key: number; url: string; from: { x: number; y: number; w: number; h: number }; to: { x: number; y: number; w: number; h: number } };

/**
 * The full-screen capture flow. Permission is requested only after the seller taps Enable camera
 * or the shutter; every other state (no camera, denied, upload) keeps them moving. Shots stay in
 * memory until Done, then upload in order to a new (or the given) draft item.
 */
export function CaptureScreen({ itemId, existingCount = 0 }: { itemId: string | null; existingCount?: number }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camera = useCamera(videoRef);
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("intro");
  const [starting, setStarting] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [activeShot, setActiveShot] = useState<Shot | null>(null);
  const [retakeId, setRetakeId] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [flyer, setFlyer] = useState<Flyer | null>(null);
  const [announce, setAnnounce] = useState("");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [draftId, setDraftId] = useState<string | null>(itemId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trayEndRef = useRef<HTMLDivElement | null>(null);
  const shutterLock = useRef(false);
  const shotsRef = useRef(shots);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  const closeHref = itemId ? `/sell/review/${itemId}` : "/sell";
  const uploadHref = itemId ? `/sell/upload?item=${encodeURIComponent(itemId)}` : "/sell/upload";
  const remaining = Math.max(0, MAX_SHOTS - existingCount - shots.length);
  const retakeIndex = retakeId ? shots.findIndex((s) => s.id === retakeId) : -1;
  const guide = guideFor(retakeIndex >= 0 ? retakeIndex : shots.length);

  // Hardware / permission outcomes drive the phase.
  useEffect(() => {
    if (camera.status === "active") setPhase((p) => (p === "uploading" ? p : "camera"));
    else if (camera.status === "denied" || camera.status === "unavailable" || camera.status === "error") setPhase((p) => (p === "intro" && !starting ? p : p === "uploading" ? p : "fallback"));
  }, [camera.status, starting]);

  // Release object URLs when leaving.
  useEffect(() => () => shotsRef.current.forEach(releaseShot), []);

  const enableCamera = useCallback(async () => {
    setStarting(true);
    const ok = await camera.start();
    setStarting(false);
    if (!ok) setPhase("fallback");
  }, [camera]);

  const addShot = useCallback(
    (shot: Shot, replaceId: string | null) => {
      setShots((prev) => {
        if (replaceId) {
          const idx = prev.findIndex((s) => s.id === replaceId);
          if (idx !== -1) {
            const old = prev[idx]!;
            releaseShot(old);
            const next = [...prev];
            next[idx] = { ...shot, label: old.label };
            return next;
          }
        }
        if (prev.length >= MAX_SHOTS - existingCount) {
          toast.error(`That's the limit — ${MAX_SHOTS} photos per item.`);
          releaseShot(shot);
          return prev;
        }
        return [...prev, shot];
      });
    },
    [existingCount],
  );

  const takePhoto = useCallback(
    async (viaKeyboard: boolean) => {
      if (shutterLock.current || camera.status !== "active") return;
      shutterLock.current = true;
      try {
        const frame = await camera.capture();
        if (!frame) {
          toast.error("The camera did not return a frame. Try again.");
          return;
        }
        navigator.vibrate?.(10);
        const index = retakeIndex >= 0 ? retakeIndex : shotsRef.current.length;
        const shot = makeShot(frame.blob, frame, index);
        // Measure the landing slot before the tray grows.
        const stage = stageRef.current?.getBoundingClientRect();
        const slot = trayEndRef.current?.getBoundingClientRect();
        addShot(shot, retakeId);
        setRetakeId(null);
        setAnnounce(`Photo ${index + 1} taken: ${shot.label}. ${index + 1} ${index + 1 === 1 ? "photo" : "photos"} in the tray.`);
        setFlash((n) => n + 1);
        if (!viaKeyboard && !reduce && shot.url && stage && slot && slot.width > 0) {
          const size = Math.min(stage.width, stage.height) * 0.42;
          setFlyer({
            key: Date.now(),
            url: shot.url,
            from: { x: stage.left + stage.width / 2 - size / 2, y: stage.top + stage.height / 2 - size / 2, w: size, h: size },
            to: { x: slot.left, y: slot.top, w: slot.width, h: slot.height },
          });
        }
      } finally {
        shutterLock.current = false;
      }
    },
    [addShot, camera, reduce, retakeId, retakeIndex],
  );

  // Space / Enter anywhere on the viewfinder takes a photo (keyboard capture never animates).
  useEffect(() => {
    if (phase !== "camera") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const interactive = t && (t.tagName === "BUTTON" || t.tagName === "INPUT" || t.tagName === "A" || t.isContentEditable || t.closest("[role=dialog]"));
      if (interactive) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        void takePhoto(true);
      } else if (e.key === "Escape" && retakeId) {
        setRetakeId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, retakeId, takePhoto]);

  const importFiles = async (files: File[]) => {
    let index = shotsRef.current.length;
    for (const file of files) {
      const check = checkClientFile(file);
      if (!check.ok) {
        toast.error(`${file.name}: ${check.reason}`);
        continue;
      }
      const dims = await measureFile(file);
      const shot = makeShot(file, dims, index, file.name);
      if (!dims.renderable) shot.url = null;
      addShot(shot, null);
      index++;
    }
    if (files.length) setAnnounce(`${files.length} ${files.length === 1 ? "photo" : "photos"} added from your device.`);
  };

  const removeShot = (shot: Shot) => {
    releaseShot(shot);
    setShots((prev) => relabelSequential(prev.filter((s) => s.id !== shot.id)));
    setActiveShot(null);
    if (retakeId === shot.id) setRetakeId(null);
    setAnnounce(`Photo removed. ${shotsRef.current.length - 1} left.`);
  };
  const moveShot = (shot: Shot, delta: number) => {
    setShots((prev) => {
      const from = prev.findIndex((s) => s.id === shot.id);
      const to = Math.max(0, Math.min(prev.length - 1, from + delta));
      if (from === -1 || to === from) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return relabelSequential(next);
    });
  };
  const beginRetake = (shot: Shot) => {
    setRetakeId(shot.id);
    setActiveShot(null);
    if (camera.status !== "active") void enableCamera();
  };

  const runUpload = async (targetId: string, subset: Shot[]) => {
    const existing = itemId === targetId ? visiblePhotos(await listPhotos(targetId)).map((p) => p.id) : [];
    const result = await uploadBatch(
      targetId,
      subset.map((s) => ({ id: s.id, blob: s.blob, filename: s.filename, label: s.label })),
      { concurrency: 2, existingOrder: existing, onUpdate: (p) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, status: p.status, progress: p.progress, error: p.error } : r))) },
    );
    return result;
  };

  const finish = async () => {
    if (!shots.length) return;
    setPhase("uploading");
    camera.stop();
    let target = draftId;
    try {
      if (!target) {
        target = (await createItem()).id;
        setDraftId(target);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the item");
      setPhase("camera");
      void camera.start();
      return;
    }
    setRows(shots.map((s) => ({ id: s.id, name: s.label, previewUrl: s.url, status: "queued", progress: 0 })));
    const result = await runUpload(target, shots);
    if (result.failures.length === 0) router.push(`/sell/review/${target}`);
  };

  const retry = async (ids: string[]) => {
    if (!draftId) return;
    const subset = shots.filter((s) => ids.includes(s.id));
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, status: "queued", progress: 0, error: undefined } : r)));
    const result = await runUpload(draftId, subset);
    if (result.failures.length === 0) router.push(`/sell/review/${draftId}`);
  };

  const mirrored = camera.facing === "user";
  const trayShots = useMemo(() => shots, [shots]);

  return (
    <div style={darkScope} className="fixed inset-0 z-40 flex flex-col bg-surface-base text-primary">
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        capture="environment"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void importFiles(files);
        }}
      />
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      {/* The video element is always mounted so the stream can attach before the camera phase renders. */}
      <div ref={stageRef} className={cn("absolute inset-0 overflow-hidden bg-black transition-opacity duration-(--dur-base)", phase === "camera" ? "opacity-100" : "pointer-events-none opacity-0")}>
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" style={mirrored ? { transform: "scaleX(-1)" } : undefined} aria-label="Live camera preview" />
        {phase === "camera" && <FramingGuide />}
        <AnimatePresence>{flash > 0 && <motion.div key={flash} className="pointer-events-none absolute inset-0 bg-white" initial={{ opacity: reduce ? 0.35 : 0.75 }} animate={{ opacity: 0 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} aria-hidden />}</AnimatePresence>
      </div>

      {phase === "intro" && <CaptureIntro onEnable={() => void enableCamera()} uploadHref={uploadHref} closeHref={closeHref} starting={starting} />}

      {phase === "fallback" && (
        <CaptureFallback status={camera.status} error={camera.error} onRetry={() => void enableCamera()} onDeviceCamera={() => fileInput.current?.click()} uploadHref={uploadHref} closeHref={closeHref} shotsTaken={shots.length} onContinue={() => void finish()} />
      )}

      {phase === "camera" && (
        <div className="relative flex size-full flex-col justify-between">
          <div className="flex h-14 items-center justify-between px-3">
            <Button variant="ghost" size="icon" aria-label={itemId ? "Back to photos" : "Close camera"} onClick={() => router.push(closeHref)} className="rounded-full bg-scrim text-white">
              <X className="size-5" />
            </Button>
            <div className="flex items-center gap-2">
              {retakeId && (
                <button type="button" onClick={() => setRetakeId(null)} className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-3 text-sm font-medium text-[oklch(0.17_0.01_120)]">
                  Retaking photo {retakeIndex + 1} · Cancel
                </button>
              )}
              {!retakeId && shots.length > 0 && <span className="rounded-full bg-scrim px-3 py-1.5 text-sm tabular text-white">{shots.length}</span>}
            </div>
            <div className="flex items-center gap-1">
              {camera.torchSupported && (
                <Button variant="ghost" size="icon" aria-label={camera.torchOn ? "Turn torch off" : "Turn torch on"} aria-pressed={camera.torchOn} onClick={() => void camera.toggleTorch()} className="rounded-full bg-scrim text-white">
                  {camera.torchOn ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
                </Button>
              )}
              {camera.canFlip && (
                <Button variant="ghost" size="icon" aria-label="Flip camera" onClick={() => void camera.flip()} className="rounded-full bg-scrim text-white">
                  <SwitchCamera className="size-5" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 px-4 pb-6 safe-bottom">
            <ShotGuideChips taken={shots.length} retakeIndex={retakeIndex >= 0 ? retakeIndex : null} />
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <CaptureTray shots={trayShots} activeId={retakeId} onSelect={setActiveShot} endRef={trayEndRef} className="max-w-full justify-self-start" />
              <ShutterButton onCapture={(kb) => void takePhoto(kb)} disabled={remaining <= 0 && !retakeId} label={retakeId ? `Retake photo ${retakeIndex + 1}` : guide ? `Take photo: ${guide.label}` : "Take photo"} />
              <div className="justify-self-end">
                <AnimatePresence initial={false}>
                  {shots.length > 0 && (
                    <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <Button variant="secondary" onClick={() => void finish()} className="h-11 rounded-full bg-white px-4 text-[oklch(0.17_0.01_120)] hover:bg-white/90" leadingIcon={<Check className="size-4" />}>
                        Done
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "uploading" && (
        <div className="relative flex size-full flex-col items-center justify-center px-4">
          <div className="w-full max-w-lg">
            <UploadProgress rows={rows} title={itemId ? "Adding your photos" : "Saving your photos"} onRetry={(ids) => void retry(ids)} onContinue={() => draftId && router.push(`/sell/review/${draftId}`)} continueLabel="Review photos" onCancel={() => setPhase("camera")} />
          </div>
        </div>
      )}

      {/* Fly-to-tray: the new shot travels from the viewfinder to its slot with the settle spring. */}
      <AnimatePresence>
        {flyer && (
          <motion.img
            key={flyer.key}
            src={flyer.url}
            alt=""
            aria-hidden
            className="pointer-events-none fixed z-50 rounded-sm object-cover shadow-lift"
            style={{ left: flyer.from.x, top: flyer.from.y, width: flyer.from.w, height: flyer.from.h, transformOrigin: "center" }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: flyer.to.x + flyer.to.w / 2 - (flyer.from.x + flyer.from.w / 2), y: flyer.to.y + flyer.to.h / 2 - (flyer.from.y + flyer.from.h / 2), scale: flyer.to.w / flyer.from.w, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            onAnimationComplete={() => setFlyer(null)}
          />
        )}
      </AnimatePresence>

      <ShotSheet shot={activeShot} index={activeShot ? shots.findIndex((s) => s.id === activeShot.id) : 0} count={shots.length} open={!!activeShot} onOpenChange={(o) => !o && setActiveShot(null)} onRetake={beginRetake} onMove={moveShot} onDelete={removeShot} />
    </div>
  );
}
