"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

type El = HTMLDivElement;

export type ZoomPanState = { scale: number; x: number; y: number };

const MIN = 1;
const MAX = 5;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_PX = 56;

type Pointer = { x: number; y: number };

/**
 * Pinch / wheel zoom with drag-to-pan for the image viewer, plus horizontal swipe detection when
 * the image is not zoomed. Works with mouse, trackpad, pen and touch through pointer events.
 */
export function useZoomPan(opts: { onSwipe?: (direction: 1 | -1) => void; enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<ZoomPanState>({ scale: 1, x: 0, y: 0 });
  const [interacting, setInteracting] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef<Map<number, Pointer>>(new Map());
  const gesture = useRef<{ startScale: number; startDist: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; swipeStart: Pointer | null } | null>(null);
  const onSwipe = opts.onSwipe;

  const size = () => {
    const r = containerRef.current?.getBoundingClientRect();
    return { width: r?.width ?? 0, height: r?.height ?? 0, left: r?.left ?? 0, top: r?.top ?? 0 };
  };

  const clamp = useCallback((next: ZoomPanState): ZoomPanState => {
    const scale = Math.min(MAX, Math.max(MIN, next.scale));
    const { width, height } = size();
    const maxX = ((scale - 1) * width) / 2;
    const maxY = ((scale - 1) * height) / 2;
    return { scale, x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) };
  }, []);

  const reset = useCallback(() => setState({ scale: 1, x: 0, y: 0 }), []);

  /** Zooms so that the point under (clientX, clientY) stays put. */
  const zoomAt = useCallback(
    (nextScale: number, clientX?: number, clientY?: number) => {
      const s = stateRef.current;
      const { width, height, left, top } = size();
      const px = clientX === undefined ? 0 : clientX - left - width / 2;
      const py = clientY === undefined ? 0 : clientY - top - height / 2;
      const target = Math.min(MAX, Math.max(MIN, nextScale));
      const ratio = target / s.scale;
      const x = px - (px - s.x) * ratio;
      const y = py - (py - s.y) * ratio;
      setState(clamp({ scale: target, x, y }));
    },
    [clamp],
  );

  const onWheel = useCallback(
    (e: ReactWheelEvent<El>) => {
      if (!enabled) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
      zoomAt(stateRef.current.scale * factor, e.clientX, e.clientY);
    },
    [enabled, zoomAt],
  );

  const onDoubleClick = useCallback(
    (e: ReactMouseEvent<El>) => {
      if (!enabled) return;
      const s = stateRef.current;
      if (s.scale > 1.05) reset();
      else zoomAt(DOUBLE_TAP_SCALE, e.clientX, e.clientY);
    },
    [enabled, reset, zoomAt],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<El>) => {
      if (!enabled) return;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = stateRef.current;
      const pts = [...pointers.current.values()];
      if (pts.length === 2) {
        const [a, b] = pts as [Pointer, Pointer];
        gesture.current = { startScale: s.scale, startDist: Math.hypot(a.x - b.x, a.y - b.y), startX: s.x, startY: s.y, originX: (a.x + b.x) / 2, originY: (a.y + b.y) / 2, moved: true, swipeStart: null };
      } else {
        gesture.current = { startScale: s.scale, startDist: 0, startX: s.x, startY: s.y, originX: e.clientX, originY: e.clientY, moved: false, swipeStart: s.scale <= 1.02 ? { x: e.clientX, y: e.clientY } : null };
      }
      setInteracting(true);
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<El>) => {
      const g = gesture.current;
      if (!g || !pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      if (pts.length >= 2) {
        const [a, b] = pts as [Pointer, Pointer];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const scale = g.startScale * (dist / (g.startDist || dist));
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        g.moved = true;
        setState(clamp({ scale, x: g.startX + (cx - g.originX), y: g.startY + (cy - g.originY) }));
        return;
      }
      const dx = e.clientX - g.originX;
      const dy = e.clientY - g.originY;
      if (Math.hypot(dx, dy) > 4) g.moved = true;
      if (stateRef.current.scale > 1.02) setState(clamp({ scale: stateRef.current.scale, x: g.startX + dx, y: g.startY + dy }));
    },
    [clamp],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<El>) => {
      const g = gesture.current;
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 0) {
        setInteracting(false);
        if (g?.swipeStart && stateRef.current.scale <= 1.02) {
          const dx = e.clientX - g.swipeStart.x;
          const dy = e.clientY - g.swipeStart.y;
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe?.(dx < 0 ? 1 : -1);
        }
        gesture.current = null;
      } else if (g) {
        // One finger lifted after a pinch: continue as a pan from the remaining pointer.
        const rest = [...pointers.current.values()][0]!;
        const s = stateRef.current;
        gesture.current = { ...g, startScale: s.scale, startDist: 0, startX: s.x, startY: s.y, originX: rest.x, originY: rest.y, swipeStart: null };
      }
    },
    [onSwipe],
  );

  // Re-clamp when the viewport changes (rotation, resize).
  useEffect(() => {
    const onResize = () => setState((s) => clamp(s));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const style: CSSProperties = {
    transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})`,
    transition: interacting ? "none" : "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)",
    touchAction: "none",
    cursor: state.scale > 1.02 ? (interacting ? "grabbing" : "grab") : "zoom-in",
  };

  return {
    containerRef,
    scale: state.scale,
    zoomed: state.scale > 1.02,
    style,
    reset,
    zoomIn: () => zoomAt(stateRef.current.scale * 1.5),
    zoomOut: () => zoomAt(stateRef.current.scale / 1.5),
    handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick },
  };
}
