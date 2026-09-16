"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/select";
import { Input, Label } from "@/components/ui/input";
import { MIN_CROP_EDGE } from "@/lib/photos/transform";
import type { PhotoDTO } from "@/lib/items/dto";
import { cn } from "@/lib/utils/cn";
import { aspectValue, clampRect, defaultCrop, describeRect, fitAspect, fitScale, HANDLES, isFullRect, moveRect, resizeRect, scaleRect, type AspectPreset, type Handle, type Rect } from "./crop-math";

const ASPECTS: Array<{ value: AspectPreset; label: string }> = [
  { value: "free", label: "Free" },
  { value: "1:1", label: "Square" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

const HANDLE_LABEL: Record<Handle, string> = { n: "top edge", s: "bottom edge", e: "right edge", w: "left edge", ne: "top-right corner", nw: "top-left corner", se: "bottom-right corner", sw: "bottom-left corner" };
const HANDLE_CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

type Drag = { kind: "move" | Handle; startX: number; startY: number; origin: Rect };

/**
 * Crop tool: a draggable rectangle over the photo with eight handles, arrow-key nudging and a
 * numeric fallback for exact values. Coordinates are in the photo's own pixels, which is what the
 * transform route expects; the server rescales them to the full-resolution original.
 */
export function CropDialog({ photo, open, onOpenChange, onApply, busy }: { photo: PhotoDTO; open: boolean; onOpenChange: (open: boolean) => void; onApply: (crop: Rect) => void | Promise<void>; busy?: boolean }) {
  const bounds = useMemo(() => ({ width: photo.width, height: photo.height }), [photo.width, photo.height]);
  const [aspect, setAspect] = useState<AspectPreset>("free");
  const [rect, setRect] = useState<Rect>(() => defaultCrop(bounds));
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const id = useId();

  useEffect(() => {
    if (open) {
      setAspect("free");
      setRect(defaultCrop(bounds));
    }
  }, [open, bounds]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const scale = fitScale(bounds, viewport);
  const display = scaleRect(rect, scale);
  const imageDisplay = { width: bounds.width * scale, height: bounds.height * scale };
  const ratio = aspectValue(aspect);

  const update = useCallback((next: Rect) => setRect(clampRect(next, bounds, MIN_CROP_EDGE)), [bounds]);

  const chooseAspect = (next: AspectPreset) => {
    setAspect(next);
    const r = aspectValue(next);
    if (r) setRect(fitAspect(rect, r, bounds));
  };

  const startDrag = (kind: Drag["kind"], e: React.PointerEvent) => {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { kind, startX: e.clientX, startY: e.clientY, origin: rect };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !scale) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (d.kind === "move") setRect(moveRect(d.origin, dx, dy, bounds));
    else setRect(resizeRect(d.origin, d.kind, dx, dy, bounds, MIN_CROP_EDGE, ratio));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const resize = e.altKey;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
        if (resize) update(resizeRect(rect, "e", -step, 0, bounds, MIN_CROP_EDGE, ratio));
        else update(moveRect(rect, -step, 0, bounds));
        break;
      case "ArrowRight":
        if (resize) update(resizeRect(rect, "e", step, 0, bounds, MIN_CROP_EDGE, ratio));
        else update(moveRect(rect, step, 0, bounds));
        break;
      case "ArrowUp":
        if (resize) update(resizeRect(rect, "s", 0, -step, bounds, MIN_CROP_EDGE, ratio));
        else update(moveRect(rect, 0, -step, bounds));
        break;
      case "ArrowDown":
        if (resize) update(resizeRect(rect, "s", 0, step, bounds, MIN_CROP_EDGE, ratio));
        else update(moveRect(rect, 0, step, bounds));
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  const numeric = (key: keyof Rect) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    let next: Rect = { ...rect, [key]: v };
    if (ratio && (key === "width" || key === "height")) next = key === "width" ? { ...next, height: v / ratio } : { ...next, width: v * ratio };
    update(next);
  };

  const unchanged = isFullRect(rect, bounds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Crop photo" description="Drag the frame or its handles. Arrow keys nudge, Shift moves faster, Alt resizes." size="xl">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div
            ref={stageRef}
            className="relative flex h-[min(56dvh,560px)] min-h-64 flex-1 items-center justify-center overflow-hidden rounded-sm bg-surface-sunken"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {scale > 0 && viewport.width > 0 && (
              <div className="relative select-none" style={{ width: imageDisplay.width, height: imageDisplay.height }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
                <img src={photo.url} alt="" width={imageDisplay.width} height={imageDisplay.height} className="pointer-events-none block h-full w-full" draggable={false} />
                <div
                  role="group"
                  tabIndex={0}
                  aria-label={`Crop frame, ${describeRect(rect)}. Use arrow keys to move, Alt plus arrows to resize.`}
                  aria-describedby={`${id}-help`}
                  onKeyDown={onKeyDown}
                  onPointerDown={(e) => startDrag("move", e)}
                  className="absolute cursor-move rounded-[2px] outline-none ring-2 ring-white/90 focus-visible:ring-accent"
                  style={{ left: display.left, top: display.top, width: display.width, height: display.height, boxShadow: "0 0 0 9999px var(--scrim-strong)" }}
                >
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-50" aria-hidden>
                    {Array.from({ length: 9 }, (_, i) => (
                      <span key={i} className="border border-white/40" />
                    ))}
                  </div>
                  {HANDLES.map((h) => (
                    <span
                      key={h}
                      role="presentation"
                      aria-hidden
                      onPointerDown={(e) => startDrag(h, e)}
                      style={{ cursor: HANDLE_CURSOR[h] }}
                      className={cn(
                        "absolute size-6 touch-none",
                        h.includes("n") && "-top-3",
                        h.includes("s") && "-bottom-3",
                        h.includes("w") && "-left-3",
                        h.includes("e") && "-right-3",
                        h === "n" || h === "s" ? "left-1/2 -translate-x-1/2" : "",
                        h === "e" || h === "w" ? "top-1/2 -translate-y-1/2" : "",
                      )}
                    >
                      <span className={cn("absolute inset-0 m-auto block rounded-full border border-surface-inverse/30 bg-white shadow-float", h.length === 2 ? "size-3.5" : "size-3")} title={HANDLE_LABEL[h]} />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-60">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-primary">Aspect</span>
              <Segmented value={aspect} onChange={chooseAspect} options={ASPECTS} aria-label="Aspect ratio" size="sm" className="w-full" />
            </div>
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-1.5 text-sm font-medium text-primary">Exact values (px)</legend>
              {(["left", "top", "width", "height"] as const).map((k) => (
                <div key={k}>
                  <Label htmlFor={`${id}-${k}`} className="text-xs text-secondary">
                    {k[0]!.toUpperCase() + k.slice(1)}
                  </Label>
                  <Input id={`${id}-${k}`} type="number" inputMode="numeric" min={0} max={k === "left" || k === "width" ? bounds.width : bounds.height} value={Math.round(rect[k])} onChange={numeric(k)} className="h-9 tabular" />
                </div>
              ))}
            </fieldset>
            <p id={`${id}-help`} className="text-xs text-secondary">
              Photo is {bounds.width} × {bounds.height} px. Crops must be at least {MIN_CROP_EDGE} px on each side. The original is kept; you can switch back any time.
            </p>
            <div className="mt-auto flex flex-col gap-2">
              <Button variant="ghost" leadingIcon={<RotateCcw className="size-4" />} onClick={() => update(defaultCrop(bounds, ratio))}>
                Reset frame
              </Button>
              <Button onClick={() => void onApply(rect)} loading={busy} disabled={unchanged}>
                Apply crop
              </Button>
              {unchanged && <p className="text-center text-xs text-muted">The frame covers the whole photo.</p>}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
