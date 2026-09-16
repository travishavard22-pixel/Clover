"use client";
import { ArrowLeft, ArrowRight, Camera, ImageOff, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Shot } from "./shots";

/** Sheet for one captured shot: retake (next shutter press replaces it), move within the order, or delete. */
export function ShotSheet({
  shot,
  index,
  count,
  open,
  onOpenChange,
  onRetake,
  onMove,
  onDelete,
}: {
  shot: Shot | null;
  index: number;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetake: (shot: Shot) => void;
  onMove: (shot: Shot, delta: number) => void;
  onDelete: (shot: Shot) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {shot && (
        <DialogContent title={`Photo ${index + 1} of ${count}`} description={shot.label} size="md">
          <div className="overflow-hidden rounded-sm bg-surface-sunken">
            {shot.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img src={shot.url} alt={`Photo ${index + 1}, ${shot.label}`} className="max-h-[50dvh] w-full object-contain" />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-secondary">
                <ImageOff className="size-6" aria-hidden />
                Preview not available in this browser — it will upload fine.
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="outline" leadingIcon={<Camera className="size-4" />} onClick={() => onRetake(shot)}>
              Retake
            </Button>
            <Button variant="outline" leadingIcon={<ArrowLeft className="size-4" />} disabled={index === 0} onClick={() => onMove(shot, -1)}>
              Move left
            </Button>
            <Button variant="outline" trailingIcon={<ArrowRight className="size-4" />} disabled={index >= count - 1} onClick={() => onMove(shot, 1)}>
              Move right
            </Button>
            <Button variant="outline" className="text-danger" leadingIcon={<Trash2 className="size-4" />} onClick={() => onDelete(shot)}>
              Delete
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
