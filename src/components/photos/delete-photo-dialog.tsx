"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import type { PhotoDTO } from "@/lib/items/dto";

export function DeletePhotoDialog({ photo, open, onOpenChange, onConfirm, busy }: { photo: PhotoDTO | null; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void | Promise<void>; busy?: boolean }) {
  const edited = photo?.kind === "ENHANCED" && !!photo.sourcePhotoId;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Delete this photo?" description={edited ? "The edit and the original it came from are both removed. This can't be undone." : "The photo and any edits made from it are removed. This can't be undone."} size="sm">
        {photo && (
          <div className="mb-4 overflow-hidden rounded-sm bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
            <img src={photo.thumbUrl} alt="" className="mx-auto max-h-48 object-contain" />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Keep photo</Button>
          </DialogClose>
          <Button variant="danger" onClick={() => void onConfirm()} loading={busy}>
            Delete photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
