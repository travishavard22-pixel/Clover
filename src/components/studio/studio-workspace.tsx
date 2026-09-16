"use client";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Check, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { DemoBadge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Page, PageHeader } from "@/components/layout/page-header";
import { STUDIO_STEPS } from "@/lib/analysis/steps";
import type { PhotoDTO } from "@/lib/items/dto";
import type { JobStep } from "@/lib/jobs/types";
import { STUDIO_MODES, STUDIO_MODE_IDS, type StudioModeId } from "@/lib/studio/modes";
import { mergeOptions, type StudioOptions } from "@/lib/studio/options";
import type { ProvenanceSummary } from "@/lib/studio/provenance";
import { ControlsPanel } from "./controls-panel";
import { ModePicker } from "./mode-picker";
import { PhotoStrip } from "./photo-strip";
import { RenderProgress } from "./render-progress";
import { RenderViewer } from "./render-viewer";
import { RendersStrip, type RenderAction } from "./renders-strip";
import { StudioApiError, deleteRender, fetchRenders, isRenderPhoto, isSourcePhoto, reorderGallery, restoreOriginal, startRender, type SegmentationInfo } from "./studio-client";
import { StudioCanvas, type CanvasImage, type CanvasView } from "./studio-canvas";
import { StudioNote } from "./studio-note";
import { useLivePreview, useModeThumbnails } from "./use-preview";

export type StudioWorkspaceProps = {
  item: { id: string; title: string };
  initial: { photos: PhotoDTO[]; provenance: Record<string, ProvenanceSummary> };
  segmentation: SegmentationInfo;
  demo: boolean;
  initialPhotoId?: string;
  initialRenderId?: string;
};

type Canvas = { kind: "preview" } | { kind: "render"; id: string };

const errorMessage = (err: unknown, fallback: string) => (err instanceof StudioApiError ? err.message : err instanceof Error ? err.message : fallback);

/** The studio screen: canvas, mode picker, controls, source strip, renders strip and the render job. */
export function StudioWorkspace({ item, initial, segmentation, demo, initialPhotoId, initialRenderId }: StudioWorkspaceProps) {
  const [photos, setPhotos] = useState(initial.photos);
  const [provenance, setProvenance] = useState(initial.provenance);
  const sources = useMemo(() => photos.filter(isSourcePhoto), [photos]);
  const renders = useMemo(() => photos.filter(isRenderPhoto), [photos]);
  const coverId = photos[0]?.id ?? null;

  const initialRender = initialRenderId ? initial.photos.find((p) => p.id === initialRenderId && isRenderPhoto(p)) : undefined;
  const [sourceId, setSourceId] = useState<string | null>(() => {
    const wanted = initialPhotoId ?? initialRender?.sourcePhotoId ?? null;
    return (wanted && sources.some((s) => s.id === wanted) ? wanted : sources[0]?.id) ?? null;
  });
  const [mode, setMode] = useState<StudioModeId>(initialRender?.studioMode ?? "CLEAN_STUDIO");
  const [options, setOptions] = useState<StudioOptions>(() => mergeOptions(STUDIO_MODES[initialRender?.studioMode ?? "CLEAN_STUDIO"].defaults, undefined));
  const [canvas, setCanvas] = useState<Canvas>(initialRender ? { kind: "render", id: initialRender.id } : { kind: "preview" });
  const [view, setView] = useState<CanvasView>("studio");
  const [job, setJob] = useState<{ id: string; steps: JobStep[] } | null>(null);
  const [starting, setStarting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PhotoDTO | null>(null);

  const source = sources.find((s) => s.id === sourceId) ?? null;
  const spec = STUDIO_MODES[mode];
  const preview = useLivePreview(item.id, sourceId, mode, options, canvas.kind === "preview");
  const thumbs = useModeThumbnails(item.id, sourceId, STUDIO_MODE_IDS);

  const selectedRender = canvas.kind === "render" ? renders.find((r) => r.id === canvas.id) ?? null : null;
  const selectedProv = selectedRender ? provenance[selectedRender.id] ?? null : null;
  const studioImage: CanvasImage | null = selectedRender
    ? { src: selectedRender.url, alt: `${selectedRender.label ?? "Studio photo"} of ${item.title}`, kind: "render", path: selectedProv?.path ?? (selectedRender.aiGenerated ? "composite" : "enhance"), label: selectedProv?.label ?? (selectedRender.aiGenerated ? "AI background" : "Studio"), reason: segmentation.reason, notes: selectedProv?.notes ?? [] }
    : preview.preview
      ? { src: preview.preview.dataUrl, alt: `Preview of ${spec.name} for ${item.title}`, kind: "preview", path: preview.preview.path as CanvasImage["path"], label: preview.preview.label, reason: segmentation.reason, notes: preview.preview.notes }
      : null;

  const patch = useCallback((fn: (o: StudioOptions) => StudioOptions) => {
    setOptions(fn);
    setCanvas({ kind: "preview" });
  }, []);
  const changeMode = (m: StudioModeId) => {
    setMode(m);
    setOptions((o) => ({ ...mergeOptions(STUDIO_MODES[m].defaults, undefined), focus: { ...o.focus }, label: o.label, flipHorizontal: o.flipHorizontal }));
    setCanvas({ kind: "preview" });
  };
  const changeSource = (id: string) => {
    setSourceId(id);
    setCanvas({ kind: "preview" });
  };
  const reset = () => patch(() => mergeOptions(spec.defaults, undefined));

  const refresh = useCallback(async () => {
    const res = await fetchRenders(item.id);
    setPhotos(res.photos);
    setProvenance(res.provenance);
    return res;
  }, [item.id]);

  const generate = async () => {
    if (!sourceId) return;
    setStarting(true);
    try {
      const { jobId, reused } = await startRender(item.id, { photoId: sourceId, mode, options });
      setJob({ id: jobId, steps: STUDIO_STEPS.map((s) => ({ ...s, status: "pending" as const })) });
      if (reused) toast("Already rendering", { description: "The same studio photo is in progress; showing its steps." });
    } catch (err) {
      toast.error("Couldn't start the render", { description: errorMessage(err, "Please try again."), action: { label: "Retry", onClick: () => void generate() } });
    } finally {
      setStarting(false);
    }
  };

  const onJobDone = useCallback(
    async ({ outcome, photoId, error }: { outcome: "succeeded" | "failed"; photoId: string | null; error: string | null }) => {
      if (outcome === "failed") {
        toast.error("Studio render stopped", { description: error ?? "The render failed. Your originals are untouched." });
        return;
      }
      try {
        const res = await refresh();
        const created = photoId ? res.photos.find((p) => p.id === photoId) : undefined;
        if (created) {
          setCanvas({ kind: "render", id: created.id });
          setView("compare");
        }
        const prov = created ? res.provenance[created.id] : undefined;
        toast.success("Studio photo ready", { description: prov ? `${prov.modeName} saved after the original and labelled “${prov.label}”.` : "Saved after the original." });
      } catch (err) {
        toast.error("Saved, but the list didn't refresh", { description: errorMessage(err, "Reload the page to see it.") });
      }
    },
    [refresh],
  );

  const runAction = async (action: RenderAction, photo: PhotoDTO) => {
    if (action === "view") {
      setCanvas({ kind: "render", id: photo.id });
      setViewerId(photo.id);
      return;
    }
    if (action === "delete") {
      setConfirmDelete(photo);
      return;
    }
    setBusyId(photo.id);
    try {
      if (action === "cover") {
        const order = [photo.id, ...photos.filter((p) => p.id !== photo.id).map((p) => p.id)];
        const res = await reorderGallery(item.id, order);
        setPhotos(res.photos);
        toast.success("Set as cover", { description: "Buyers will see this studio photo first. The original stays in the gallery and is still labelled." });
      } else if (action === "use-original") {
        const res = await restoreOriginal(item.id, photo.id, false);
        setPhotos(res.photos);
        setProvenance(res.provenance);
        setSourceId(res.sourceId);
        setCanvas({ kind: "preview" });
        setView("original");
        toast.success("Using the original", { description: "The original photo is back in that slot. The studio version was kept at the end of the gallery." });
      }
    } catch (err) {
      toast.error("That didn't work", { description: errorMessage(err, "Please try again.") });
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (photo: PhotoDTO) => {
    setConfirmDelete(null);
    setBusyId(photo.id);
    try {
      const res = await deleteRender(item.id, photo.id);
      setPhotos(res.photos);
      setProvenance(res.provenance);
      if (canvas.kind === "render" && canvas.id === photo.id) setCanvas({ kind: "preview" });
      toast.success("Studio photo deleted", { description: "The original was not touched." });
    } catch (err) {
      toast.error("Couldn't delete", { description: errorMessage(err, "Please try again.") });
    } finally {
      setBusyId(null);
    }
  };

  const useOriginalTarget = selectedRender ?? [...renders].reverse().find((r) => r.sourcePhotoId === sourceId) ?? null;
  const hasRenderForCurrent = renders.some((r) => r.sourcePhotoId === sourceId && r.studioMode === mode);
  const generateLabel = job && job.id && starting ? "Starting…" : hasRenderForCurrent ? "Regenerate" : "Generate";
  const viewerRender = viewerId ? renders.find((r) => r.id === viewerId) ?? null : null;

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="md" disabled={!useOriginalTarget || busyId !== null} onClick={() => useOriginalTarget && void runAction("use-original", useOriginalTarget)} leadingIcon={<RotateCcw className="size-4" aria-hidden />}>
        Use original
      </Button>
      <Button size="md" onClick={() => void generate()} loading={starting} disabled={!sourceId} leadingIcon={<Sparkles className="size-4" aria-hidden />}>
        {generateLabel}
      </Button>
    </div>
  );

  return (
    <Page width="wide" className="pb-28 lg:pb-12">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link href={`/items/${item.id}`} className="inline-flex items-center gap-1 rounded-xs text-secondary hover:text-primary">
              <ArrowLeft className="size-3.5" aria-hidden /> Item
            </Link>
            <span aria-hidden>·</span> Photo studio
            {demo && <DemoBadge />}
          </span>
        }
        title={item.title}
        description="Backgrounds, shadow and framing change. The item never does."
        actions={
          <Link href={`/items/${item.id}`} className={buttonClasses("secondary", "md")}>
            <Check className="size-4" aria-hidden /> Done
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="order-1 min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <StudioCanvas original={source ? { src: source.url, alt: `Original photo of ${item.title}` } : null} studio={studioImage} loading={canvas.kind === "preview" && preview.status === "loading"} error={canvas.kind === "preview" ? preview.error : null} view={view} onViewChange={setView} />
          {job && <RenderProgress key={job.id} jobId={job.id} initialSteps={job.steps} onDone={onJobDone} onRetry={() => void generate()} />}
        </div>

        <aside className="order-2 min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Mode and adjustments">
          <ModePicker value={mode} onChange={changeMode} thumbs={thumbs} segmentationAvailable={segmentation.available} />
          <div className="hidden lg:block">{actions}</div>
          <ControlsPanel spec={spec} options={options} onPatch={patch} onReset={reset} source={source ? { src: source.url, alt: `Original photo of ${item.title}` } : null} />
        </aside>

        <div className="order-3 min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          <PhotoStrip photos={sources} value={sourceId} coverId={coverId} onChange={changeSource} />
          <RendersStrip renders={renders} provenance={provenance} selectedId={selectedRender?.id ?? null} coverId={coverId} busyId={busyId} onAction={(a, p) => void runAction(a, p)} />
        </div>
      </div>

      <StudioNote className="mt-8 border-t border-border-subtle pt-4" />

      {/* Mobile action bar */}
      <div className="fixed inset-x-0 bottom-(--tabbar-h) z-20 border-t border-border-subtle bg-surface-base/95 backdrop-blur gutter py-2 lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-secondary">{spec.name} · {source ? "ready" : "add a photo first"}</p>
          {actions}
        </div>
      </div>

      <RenderViewer render={viewerRender} source={viewerRender ? sources.find((s) => s.id === viewerRender.sourcePhotoId) ?? null : null} provenance={viewerRender ? provenance[viewerRender.id] ?? null : null} open={!!viewerRender} onClose={() => setViewerId(null)} />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        {confirmDelete && (
          <DialogContent title="Delete this studio photo?" description="The original photo it was made from is kept. This cannot be undone." size="sm">
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Keep it
              </Button>
              <Button variant="danger" leadingIcon={<Trash2 className="size-4" aria-hidden />} onClick={() => void doDelete(confirmDelete)}>
                Delete
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
