"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Archive, Download, MapPin, Percent, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/switch";
import type { BatchInput, BatchResult } from "@/lib/inventory/batch";
import { ITEM_STATUS_META } from "@/lib/items/status";
import { inventoryApi, downloadBlob } from "./inventory-api";

type DialogKind = "status" | "storage" | "reprice" | "delete" | null;

export function BatchBar({
  count,
  total,
  allSelected,
  onSelectAll,
  onClear,
  ids,
  onDone,
}: {
  count: number;
  total: number;
  allSelected: boolean;
  onSelectAll: (on: boolean) => void;
  onClear: () => void;
  ids: string[];
  /** Called with the batch result so the list can update in place. */
  onDone: (result: BatchResult, input: BatchInput) => void;
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const open = count > 0;

  const run = async (input: BatchInput, label: string) => {
    setBusy(input.op);
    try {
      const result = await inventoryApi.batch(input);
      onDone(result, input);
      const skipped = result.skipped ? ` · ${result.skipped} skipped` : "";
      toast.success(`${label}: ${result.applied} item${result.applied === 1 ? "" : "s"}${skipped}`, {
        description: result.results.find((r) => !r.ok)?.reason,
      });
      setDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    setBusy("export_csv");
    try {
      const blob = await inventoryApi.exportCsv(ids);
      downloadBlob(blob, `clover-inventory-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`Exported ${ids.length} item${ids.length === 1 ? "" : "s"} to CSV`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            role="toolbar"
            aria-label={`${count} selected`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-x-3 bottom-[calc(var(--tabbar-h)+12px)] z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-md border border-border-default bg-surface-floating p-2 shadow-lift lg:bottom-6 lg:inset-x-auto lg:left-[calc(var(--nav-w)+50%)] lg:-translate-x-1/2 lg:right-auto lg:w-max"
          >
            <label className="flex h-9 items-center gap-2 rounded-xs px-2 text-sm">
              <Checkbox checked={allSelected} onCheckedChange={(v) => onSelectAll(v === true)} aria-label="Select all loaded items" />
              <span className="tabular font-medium text-primary">{count}</span>
              <span className="text-muted">
                of {total} <span className="hidden sm:inline">selected</span>
              </span>
            </label>
            <span className="hidden h-6 w-px bg-border-subtle sm:block" aria-hidden />
            <Button variant="ghost" size="sm" leadingIcon={<Tag className="size-4" />} onClick={() => setDialog("status")}>
              Status
            </Button>
            <Button variant="ghost" size="sm" leadingIcon={<MapPin className="size-4" />} onClick={() => setDialog("storage")}>
              Location
            </Button>
            <Button variant="ghost" size="sm" leadingIcon={<Percent className="size-4" />} onClick={() => setDialog("reprice")}>
              Reprice
            </Button>
            <Button variant="ghost" size="sm" leadingIcon={<Archive className="size-4" />} loading={busy === "archive"} onClick={() => run({ op: "archive", ids }, "Archived")}>
              Archive
            </Button>
            <Button variant="ghost" size="sm" leadingIcon={<Download className="size-4" />} loading={busy === "export_csv"} onClick={exportCsv}>
              CSV
            </Button>
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" leadingIcon={<Trash2 className="size-4" />} onClick={() => setDialog("delete")}>
              Delete
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear}>
              <X className="size-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <StatusDialog open={dialog === "status"} onClose={() => setDialog(null)} busy={busy === "set_status"} onSubmit={(status) => run({ op: "set_status", ids, params: { status } }, `Set to ${ITEM_STATUS_META[status].label}`)} count={count} />
      <StorageDialog open={dialog === "storage"} onClose={() => setDialog(null)} busy={busy === "set_storage"} onSubmit={(storageLocation) => run({ op: "set_storage", ids, params: { storageLocation } }, storageLocation ? `Moved to ${storageLocation}` : "Cleared location")} count={count} />
      <RepriceDialog open={dialog === "reprice"} onClose={() => setDialog(null)} busy={busy === "reprice"} onSubmit={(params) => run({ op: "reprice", ids, params }, "Repriced")} count={count} />
      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={`Delete ${count} item${count === 1 ? "" : "s"}?`} description="Drafts and archived items are deleted with their photos. Anything that was listed or sold is archived instead, so your sales history stays intact." size="sm">
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === "delete"} onClick={() => run({ op: "delete", ids }, "Deleted")}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusDialog({ open, onClose, onSubmit, busy, count }: { open: boolean; onClose: () => void; onSubmit: (s: "DRAFT" | "READY" | "LISTED" | "ARCHIVED") => void; busy: boolean; count: number }) {
  const [status, setStatus] = useState<"DRAFT" | "READY" | "LISTED" | "ARCHIVED">("READY");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Set status" description={`Applies to ${count} item${count === 1 ? "" : "s"}. Items that can't move to this status are skipped and reported.`} size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(status);
          }}
        >
          <Field label="New status">{(p) => <Select id={p.id} value={status} onValueChange={(v) => setStatus(v as typeof status)} options={(["DRAFT", "READY", "LISTED", "ARCHIVED"] as const).map((s) => ({ value: s, label: ITEM_STATUS_META[s].label, description: ITEM_STATUS_META[s].description }))} />}</Field>
          <p className="text-sm text-secondary">To record a sale, open the item and use Mark sold so fees and the double-sell guard are handled.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Apply
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StorageDialog({ open, onClose, onSubmit, busy, count }: { open: boolean; onClose: () => void; onSubmit: (loc: string | null) => void; busy: boolean; count: number }) {
  const [value, setValue] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Storage location" description={`Where these ${count} item${count === 1 ? " is" : "s are"} kept. Leave empty to clear.`} size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(value.trim() || null);
          }}
        >
          <Field label="Location" hint="e.g. Shelf B2, Garage bin 4">{(p) => <Input {...p} value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} autoFocus />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RepriceDialog({ open, onClose, onSubmit, busy, count }: { open: boolean; onClose: () => void; onSubmit: (p: { mode: "percent"; percent: number; round?: boolean } | { mode: "absolute"; cents: number }) => void; busy: boolean; count: number }) {
  const [mode, setMode] = useState<"percent" | "absolute">("percent");
  const [percent, setPercent] = useState("-10");
  const [dollars, setDollars] = useState("");
  const [round, setRound] = useState(true);
  const pct = Number(percent);
  const cents = Math.round(Number(dollars) * 100);
  const valid = mode === "percent" ? Number.isFinite(pct) && pct >= -90 && pct <= 500 && pct !== 0 : Number.isFinite(cents) && cents >= 100;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Reprice" description={`Changes the list price on ${count} item${count === 1 ? "" : "s"}. Prices never go below an item's floor price.`} size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSubmit(mode === "percent" ? { mode, percent: pct, round } : { mode, cents });
          }}
        >
          <Field label="Method">{(p) => <Select id={p.id} value={mode} onValueChange={(v) => setMode(v as typeof mode)} options={[{ value: "percent", label: "Change by a percentage", description: "Negative lowers, positive raises" }, { value: "absolute", label: "Set the same price on all" }]} />}</Field>
          {mode === "percent" ? (
            <>
              <Field label="Percent" hint="For example −10 to lower prices by 10%.">{(p) => <Input {...p} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^0-9.\-]/g, ""))} className="tabular" autoFocus />}</Field>
              <label className="flex items-center gap-2 text-sm text-primary">
                <Checkbox checked={round} onCheckedChange={(v) => setRound(v === true)} />
                Round to marketplace-friendly price points ($x.99 under $50, whole dollars under $200, $5 steps above)
              </label>
            </>
          ) : (
            <Field label="New price">{(p) => <Input {...p} inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="tabular" autoFocus />}</Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!valid}>
              Apply
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
