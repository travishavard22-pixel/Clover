"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type Announcements, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { deletePhoto, listPhotos, relabelPhoto, reorderPhotos, transformPhoto, uploadBatch, uploadPhoto } from "@/components/capture/upload-client";
import type { PhotoDTO } from "@/lib/items/dto";
import { ACCEPT_ATTRIBUTE, checkClientFile, MAX_PHOTOS_PER_ITEM } from "@/lib/photos/mime";
import { moveBy, visiblePhotos } from "@/lib/photos/order";
import { cn } from "@/lib/utils/cn";
import { AddPhotosTile } from "./add-photos-tile";
import { CropDialog } from "./crop-dialog";
import type { Rect } from "./crop-math";
import { DeletePhotoDialog } from "./delete-photo-dialog";
import type { PhotoAction } from "./photo-actions-menu";
import { RenamePhotoDialog } from "./rename-photo-dialog";
import { PhotoTileFace, SortablePhotoTile } from "./sortable-photo-tile";

/**
 * <PhotoManager itemId photos onChange onOpen? allowAdd? className? />
 *
 * Editable photo grid for one item: drag-and-drop reorder (pointer, touch and keyboard, plus
 * "Move left / right" in each photo's menu), cover marking, rotate / crop / enhance (each creates a
 * new photo and swaps it into the slot; "Use original" swaps back), replace, relabel, delete and
 * add. `photos` is the complete list from GET /api/items/[id]/photos (superseded edit sources
 * included); `onChange` always receives that same complete shape back.
 */
export function PhotoManager({
  itemId,
  photos,
  onChange,
  onOpen,
  allowAdd = true,
  className,
}: {
  itemId: string;
  photos: PhotoDTO[];
  onChange: (photos: PhotoDTO[]) => void;
  /** Called with the visible index when a tile is clicked (e.g. to open the viewer). */
  onOpen?: (index: number) => void;
  allowAdd?: boolean;
  className?: string;
}) {
  const visible = useMemo(() => visiblePhotos(photos), [photos]);
  const ids = useMemo(() => visible.map((p) => p.id), [visible]);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<PhotoDTO | null>(null);
  const [cropTarget, setCropTarget] = useState<PhotoDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PhotoDTO | null>(null);
  const [renameTarget, setRenameTarget] = useState<PhotoDTO | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [addProgress, setAddProgress] = useState<{ done: number; total: number } | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const replaceTarget = useRef<PhotoDTO | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setPhotoBusy = useCallback((id: string, label: string | null) => {
    setBusy((b) => {
      const next = { ...b };
      if (label) next[id] = label;
      else delete next[id];
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await listPhotos(itemId);
    onChange(fresh);
    return fresh;
  }, [itemId, onChange]);

  const fail = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    toast.error(message);
  };

  /** Optimistic reorder; reverted with a message if the server rejects it. */
  const applyOrder = useCallback(
    async (nextIds: string[]) => {
      const previous = photos;
      const byId = new Map(photos.map((p) => [p.id, p]));
      const optimistic = photos.map((p) => {
        const at = nextIds.indexOf(p.id);
        return at === -1 ? p : { ...byId.get(p.id)!, sortOrder: at };
      });
      onChange(optimistic);
      try {
        onChange(await reorderPhotos(itemId, nextIds));
      } catch (err) {
        onChange(previous);
        fail(err, "The new order could not be saved");
      }
    },
    [itemId, onChange, photos],
  );

  const onDragStart = (e: DragStartEvent) => setDragging(visible.find((p) => p.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    void applyOrder(arrayMove(ids, from, to));
  };

  const transform = useCallback(
    async (photo: PhotoDTO, body: Parameters<typeof transformPhoto>[2], label: string, done: string) => {
      setPhotoBusy(photo.id, label);
      try {
        await transformPhoto(itemId, photo.id, body);
        await refresh();
        toast.success(done);
      } catch (err) {
        fail(err, `${label.replace("…", "")} failed`);
      } finally {
        setPhotoBusy(photo.id, null);
      }
    },
    [itemId, refresh, setPhotoBusy],
  );

  const handleAction = (photo: PhotoDTO, index: number) => (action: PhotoAction) => {
    switch (action) {
      case "rotate":
        return void transform(photo, { rotate: 90 }, "Rotating…", "Rotated 90°. The original is kept.");
      case "enhance":
        return void transform(photo, { enhance: true }, "Enhancing…", "Enhanced exposure and sharpness. The original is kept.");
      case "useOriginal":
        return void transform(photo, { useOriginal: true }, "Restoring…", "Original photo restored.");
      case "crop":
        return setCropTarget(photo);
      case "makeCover":
        return void applyOrder([photo.id, ...ids.filter((id) => id !== photo.id)]);
      case "moveLeft":
        return void applyOrder(moveBy(visible, photo.id, -1).map((p) => p.id));
      case "moveRight":
        return void applyOrder(moveBy(visible, photo.id, 1).map((p) => p.id));
      case "rename":
        return setRenameTarget(photo);
      case "replace":
        replaceTarget.current = photo;
        return replaceInput.current?.click();
      case "delete":
        return setDeleteTarget(photo);
      default:
        return void index;
    }
  };

  const applyCrop = async (crop: Rect) => {
    if (!cropTarget) return;
    setDialogBusy(true);
    try {
      await transform(cropTarget, { crop }, "Cropping…", "Cropped. The original is kept.");
      setCropTarget(null);
    } finally {
      setDialogBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDialogBusy(true);
    try {
      onChange(await deletePhoto(itemId, deleteTarget.id));
      toast.success("Photo deleted.");
      setDeleteTarget(null);
    } catch (err) {
      fail(err, "The photo could not be deleted");
    } finally {
      setDialogBusy(false);
    }
  };

  const saveLabel = async (label: string | null) => {
    if (!renameTarget) return;
    setDialogBusy(true);
    try {
      await relabelPhoto(itemId, renameTarget.id, label);
      await refresh();
      setRenameTarget(null);
    } catch (err) {
      fail(err, "The label could not be saved");
    } finally {
      setDialogBusy(false);
    }
  };

  /** Replace = upload the new file, put it in the old slot, then remove the old photo. */
  const replaceWith = async (file: File) => {
    const target = replaceTarget.current;
    replaceTarget.current = null;
    if (!target) return;
    const check = checkClientFile(file);
    if (!check.ok) return toast.error(`${file.name}: ${check.reason}`);
    const slot = ids.indexOf(target.id);
    setPhotoBusy(target.id, "Replacing…");
    try {
      const uploaded = await uploadPhoto(itemId, file, { label: target.label, filename: file.name });
      const afterDelete = await deletePhoto(itemId, target.id);
      const order = visiblePhotos(afterDelete).map((p) => p.id).filter((id) => id !== uploaded.id);
      order.splice(Math.max(0, slot), 0, uploaded.id);
      onChange(await reorderPhotos(itemId, order));
      toast.success("Photo replaced.");
    } catch (err) {
      await refresh().catch(() => undefined);
      fail(err, "The photo could not be replaced");
    } finally {
      setPhotoBusy(target.id, null);
    }
  };

  const addFiles = async (files: File[]) => {
    const remaining = MAX_PHOTOS_PER_ITEM - visible.length;
    const accepted: File[] = [];
    for (const f of files) {
      const check = checkClientFile(f);
      if (!check.ok) toast.error(`${f.name}: ${check.reason}`);
      else accepted.push(f);
    }
    if (accepted.length > remaining) toast.error(`Only ${remaining} more ${remaining === 1 ? "photo fits" : "photos fit"} (limit ${MAX_PHOTOS_PER_ITEM}).`);
    const batch = accepted.slice(0, Math.max(0, remaining));
    if (!batch.length) return;
    setAddProgress({ done: 0, total: batch.length });
    let done = 0;
    const result = await uploadBatch(
      itemId,
      batch.map((f, i) => ({ id: `add-${i}`, blob: f, filename: f.name })),
      {
        concurrency: 2,
        existingOrder: ids,
        onUpdate: (p) => {
          if (p.status === "done" || p.status === "failed") setAddProgress({ done: ++done, total: batch.length });
        },
      },
    );
    setAddProgress(null);
    await refresh().catch(() => undefined);
    for (const f of result.failures) toast.error(f.error);
    const saved = batch.length - result.failures.length;
    if (saved) toast.success(`${saved} ${saved === 1 ? "photo" : "photos"} added.`);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up photo ${ids.indexOf(String(active.id)) + 1} of ${ids.length}.`,
    onDragOver: ({ active, over }) => (over ? `Photo ${ids.indexOf(String(active.id)) + 1} is over position ${ids.indexOf(String(over.id)) + 1}.` : "Not over a slot."),
    onDragEnd: ({ active, over }) => (over ? `Photo moved to position ${ids.indexOf(String(over.id)) + 1}.` : `Photo ${ids.indexOf(String(active.id)) + 1} dropped back in place.`),
    onDragCancel: ({ active }) => `Reorder cancelled. Photo ${ids.indexOf(String(active.id)) + 1} returned to its slot.`,
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <input
        ref={replaceInput}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void replaceWith(f);
        }}
      />
      <DndContext id="dnd-photo-manager" sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)} accessibility={{ announcements, screenReaderInstructions: { draggable: "To reorder, press space or enter on a photo's reorder handle, move with the arrow keys, then press space or enter again to drop. Escape cancels. Every photo's menu also offers Move left and Move right." } }}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label={`${visible.length} ${visible.length === 1 ? "photo" : "photos"}. The first photo is the cover.`}>
            {visible.map((photo, index) => (
              <SortablePhotoTile key={photo.id} photo={photo} index={index} count={visible.length} busy={busy[photo.id] ?? null} onAction={handleAction(photo, index)} onOpen={onOpen ? () => onOpen(index) : undefined} />
            ))}
            {allowAdd && <AddPhotosTile onFiles={(files) => void addFiles(files)} remaining={MAX_PHOTOS_PER_ITEM - visible.length} progress={addProgress} />}
          </ul>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}>{dragging ? <PhotoTileFace photo={dragging} index={ids.indexOf(dragging.id)} ghost /> : null}</DragOverlay>
      </DndContext>
      <p className="text-xs text-secondary">
        Drag to reorder, or use a photo&apos;s menu. Edits create a new version and keep the original — you can always go back. {visible.length} of {MAX_PHOTOS_PER_ITEM} photos.
      </p>

      {cropTarget && <CropDialog photo={cropTarget} open onOpenChange={(o) => !o && setCropTarget(null)} onApply={applyCrop} busy={dialogBusy} />}
      <DeletePhotoDialog photo={deleteTarget} open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} onConfirm={confirmDelete} busy={dialogBusy} />
      <RenamePhotoDialog photo={renameTarget} open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)} onSave={saveLabel} busy={dialogBusy} />
    </div>
  );
}
