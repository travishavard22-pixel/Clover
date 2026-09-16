"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Camera, ClipboardPaste, ImageOff, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { ACCEPT_ATTRIBUTE, checkClientFile, MAX_PHOTOS_PER_ITEM } from "@/lib/photos/mime";
import { visiblePhotos } from "@/lib/photos/order";
import { cn } from "@/lib/utils/cn";
import { labelForShot } from "./shot-guide";
import { measureFile } from "./shots";
import { createItem, listPhotos, uploadBatch } from "./upload-client";
import { UploadProgress, type UploadRow } from "./upload-progress";

type Picked = { id: string; file: File; previewUrl: string | null; width: number; height: number };
type Rejected = { id: string; name: string; reason: string };
type Phase = "pick" | "uploading";

let seq = 0;
const nextId = () => `f-${Date.now().toString(36)}-${++seq}`;

/**
 * Upload photos from disk or the camera roll: drag-and-drop, file picker, or paste. Files are
 * pre-flighted client-side (type, size, count) and the server re-validates from bytes. Rejected
 * files are listed with the reason so nothing disappears silently.
 */
export function UploadScreen({ itemId, existingCount = 0 }: { itemId: string | null; existingCount?: number }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("pick");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [draftId, setDraftId] = useState<string | null>(itemId);
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  const limit = MAX_PHOTOS_PER_ITEM - existingCount;
  const remaining = Math.max(0, limit - picked.length);

  useEffect(() => () => pickedRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl)), []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const accepted: Picked[] = [];
      const bad: Rejected[] = [];
      let room = Math.max(0, limit - pickedRef.current.length);
      for (const file of files) {
        const check = checkClientFile(file);
        if (!check.ok) {
          bad.push({ id: nextId(), name: file.name || "Untitled", reason: check.reason });
          continue;
        }
        if (room <= 0) {
          bad.push({ id: nextId(), name: file.name || "Untitled", reason: `Over the ${MAX_PHOTOS_PER_ITEM}-photo limit` });
          continue;
        }
        room--;
        const dims = await measureFile(file);
        let previewUrl: string | null = null;
        if (dims.renderable) {
          try {
            previewUrl = URL.createObjectURL(file);
          } catch {
            previewUrl = null;
          }
        }
        accepted.push({ id: nextId(), file, previewUrl, width: dims.width, height: dims.height });
      }
      if (accepted.length) setPicked((p) => [...p, ...accepted]);
      if (bad.length) setRejected((r) => [...r, ...bad]);
      setAnnounce(`${accepted.length} ${accepted.length === 1 ? "photo" : "photos"} added${bad.length ? `, ${bad.length} rejected` : ""}.`);
    },
    [limit],
  );

  // Paste anywhere on the page.
  useEffect(() => {
    if (phase !== "pick") return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/") || checkClientFile(f).ok);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles, phase]);

  const remove = (id: string) => {
    setPicked((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  };
  const clearAll = () => {
    picked.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setPicked([]);
  };

  const runUpload = async (targetId: string, subset: Picked[]) => {
    const existing = itemId === targetId ? visiblePhotos(await listPhotos(targetId)).map((p) => p.id) : [];
    return uploadBatch(
      targetId,
      subset.map((p) => ({ id: p.id, blob: p.file, filename: p.file.name, label: labelForShot(picked.indexOf(p) + existingCount) })),
      { concurrency: 3, existingOrder: existing, onUpdate: (u) => setRows((rs) => rs.map((r) => (r.id === u.id ? { ...r, status: u.status, progress: u.progress, error: u.error } : r))) },
    );
  };

  const start = async () => {
    if (!picked.length) return;
    setPhase("uploading");
    let target = draftId;
    try {
      if (!target) {
        target = (await createItem()).id;
        setDraftId(target);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the item");
      setPhase("pick");
      return;
    }
    setRows(picked.map((p) => ({ id: p.id, name: p.file.name, previewUrl: p.previewUrl, status: "queued", progress: 0 })));
    const result = await runUpload(target, picked);
    if (result.failures.length === 0) router.push(`/sell/review/${target}`);
  };

  const retry = async (ids: string[]) => {
    if (!draftId) return;
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, status: "queued", progress: 0, error: undefined } : r)));
    const result = await runUpload(draftId, picked.filter((p) => ids.includes(p.id)));
    if (result.failures.length === 0) router.push(`/sell/review/${draftId}`);
  };

  if (phase === "uploading") {
    return (
      <div className="mx-auto w-full max-w-lg py-6">
        <UploadProgress rows={rows} title={itemId ? "Adding your photos" : "Saving your photos"} onRetry={(ids) => void retry(ids)} onContinue={() => draftId && router.push(`/sell/review/${draftId}`)} continueLabel="Review photos" onCancel={() => setPhase("pick")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addFiles(files);
        }}
      />

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex min-h-56 flex-col items-center justify-center gap-4 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors duration-(--dur-fast)",
          dragOver ? "border-accent bg-accent-soft" : "border-border-default bg-surface-raised",
        )}
      >
        <span className={cn("flex size-14 items-center justify-center rounded-full", dragOver ? "bg-accent text-on-accent" : "bg-surface-sunken text-secondary")}>
          <Upload className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <p className="text-lg font-semibold text-primary">{dragOver ? "Drop to add" : "Drop photos here"}</p>
          <p className="mt-1 text-sm text-secondary">
            JPEG, PNG, WebP, HEIC, AVIF, GIF or TIFF · up to 25 MB each · {remaining} more {remaining === 1 ? "fits" : "fit"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => inputRef.current?.click()} disabled={remaining <= 0} leadingIcon={<Upload className="size-4" />}>
            Choose photos
          </Button>
          <Link href={itemId ? `/sell/capture?item=${encodeURIComponent(itemId)}` : "/sell/capture"} className={buttonClasses("outline", "md")}>
            <Camera className="size-4" aria-hidden /> Use the camera
          </Link>
        </div>
        <p className="inline-flex items-center gap-1.5 text-xs text-muted">
          <ClipboardPaste className="size-3.5" aria-hidden /> You can also paste an image from the clipboard.
        </p>
      </div>

      {rejected.length > 0 && (
        <section aria-labelledby="rejected-title" className="rounded-sm border border-danger/30 bg-danger-soft p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="rejected-title" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
              <AlertCircle className="size-4 text-danger" aria-hidden /> {rejected.length} {rejected.length === 1 ? "file was" : "files were"} not added
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setRejected([])}>
              Dismiss
            </Button>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {rejected.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-2 text-secondary">
                <span className="truncate font-medium text-primary">{r.name}</span> <span>— {r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {picked.length > 0 && (
        <section aria-labelledby="picked-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="picked-title" className="text-base font-semibold text-primary">
              {picked.length} {picked.length === 1 ? "photo" : "photos"} ready
              <span className="ml-2 text-sm font-normal text-secondary">First one is the cover — you can reorder in the next step.</span>
            </h2>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          </div>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-label="Selected photos">
            {picked.map((p, i) => (
              <li key={p.id} className="group relative aspect-square overflow-hidden rounded-sm border border-border-subtle bg-surface-sunken">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL
                  <img src={p.previewUrl} alt={`Selected photo ${i + 1}: ${p.file.name}`} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-muted">
                    <ImageOff className="size-5" aria-hidden />
                    <span className="text-[10px] leading-tight">Preview unavailable here (HEIC). Uploads fine.</span>
                  </span>
                )}
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-scrim px-1.5 text-[11px] font-medium tabular text-white">{i === 0 ? "Cover" : i + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Remove ${p.file.name}`}
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-scrim text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-[calc(var(--tabbar-h)+0.75rem)] z-10 flex items-center justify-between gap-3 rounded-sm border border-border-default bg-surface-overlay p-3 shadow-float lg:bottom-4">
            <p className="text-sm text-secondary">
              {picked.length} {picked.length === 1 ? "photo" : "photos"} · {(picked.reduce((a, p) => a + p.file.size, 0) / 1024 / 1024).toFixed(1)} MB
            </p>
            <Button size="lg" onClick={() => void start()} leadingIcon={<Upload className="size-5" />}>
              Upload {picked.length} {picked.length === 1 ? "photo" : "photos"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
