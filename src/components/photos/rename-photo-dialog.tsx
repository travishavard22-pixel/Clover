"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SHOT_GUIDE } from "@/components/capture/shot-guide";
import type { PhotoDTO } from "@/lib/items/dto";

/** Labels tell the analysis which angle it is looking at ("Label or tag", "Any defects"). */
export function RenamePhotoDialog({ photo, open, onOpenChange, onSave, busy }: { photo: PhotoDTO | null; open: boolean; onOpenChange: (open: boolean) => void; onSave: (label: string | null) => void | Promise<void>; busy?: boolean }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue(photo?.label ?? "");
  }, [open, photo]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Photo label" description="A short note about what this photo shows. It is saved with the photo and helps the identification." size="sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(value.trim() || null);
          }}
        >
          <Field label="Label" hint="Up to 80 characters" optional>
            {(p) => <Input {...p} value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Serial number" autoFocus />}
          </Field>
          <div className="flex flex-wrap gap-1.5" aria-label="Suggested labels">
            {SHOT_GUIDE.map((s) => (
              <button key={s.label} type="button" onClick={() => setValue(s.label)} className="h-8 rounded-full border border-border-default bg-surface-raised px-3 text-xs font-medium text-secondary hover:bg-surface-sunken">
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={busy}>
              Save label
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
