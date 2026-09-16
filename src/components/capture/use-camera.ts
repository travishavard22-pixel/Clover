"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "starting" | "active" | "denied" | "unavailable" | "error";
export type Facing = "environment" | "user";
export type CapturedFrame = { blob: Blob; width: number; height: number };

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraints = MediaTrackConstraintSet & { torch?: boolean };

/**
 * Camera lifecycle for the capture screen. Permission is requested only when `start()` is called
 * (after the seller taps the shutter or "Enable camera"), never on mount.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [facing, setFacing] = useState<Facing>("environment");
  const [canFlip, setCanFlip] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
    if (!supported) setStatus("unavailable");
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
  }, []);

  const start = useCallback(
    async (nextFacing: Facing = facing) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return false;
      }
      setStatus("starting");
      setError(null);
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: nextFacing }, width: { ideal: 4032 }, height: { ideal: 3024 } },
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings();
        if (settings?.facingMode === "user" || settings?.facingMode === "environment") setFacing(settings.facingMode);
        else setFacing(nextFacing);
        const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
        setTorchSupported(caps.torch === true);
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1);
        } catch {
          setCanFlip(false);
        }
        setStatus("active");
        return true;
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === "NotAllowedError" || name === "SecurityError") setStatus("denied");
        else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") {
          setStatus("unavailable");
          setError(name === "NotReadableError" ? "The camera is in use by another app." : "No camera was found on this device.");
        } else {
          setStatus("error");
          setError(err instanceof Error ? err.message : "The camera could not be started.");
        }
        return false;
      }
    },
    [facing, stop],
  );

  const flip = useCallback(async () => {
    const next: Facing = facing === "environment" ? "user" : "environment";
    await start(next);
  }, [facing, start]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraints] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn, torchSupported]);

  /** Grabs the current frame at the stream's native resolution as a JPEG. */
  const capture = useCallback(async (): Promise<CapturedFrame | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return null;
    return { blob, width: canvas.width, height: canvas.height };
  }, []);

  // Mobile browsers end the stream when the tab is backgrounded; resume when it comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || status !== "active") return;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") void start(facing);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status, facing, start]);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, status, error, facing, canFlip, torchSupported, torchOn, start, stop, flip, toggleTorch, capture };
}
