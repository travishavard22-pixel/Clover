"use client";
import * as D from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, ArrowUpRight, CircleDollarSign, Ellipsis, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfidenceBadge, DemoBadge } from "@/components/ui/badge";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import type { ConditionGrade, ItemStatus } from "@/lib/db";
import { canTransition, ITEM_STATUS_META } from "@/lib/items/status";
import type { ItemListDTO } from "@/lib/inventory/types";
import type { ItemUpdate } from "@/lib/inventory/update";
import { isSoldStatus } from "@/lib/inventory/compute";
import { cn } from "@/lib/utils/cn";
import { CoverImage } from "./cover-image";
import { ItemStatusBadge } from "./status-badge";
import { MarketplaceDots } from "./marketplace-dots";
import { CONDITION_OPTIONS, daysLabel, fromDateInput, toDateInput } from "./format";
import { diffFields, editableFields, inventoryApi, InventoryApiError, type EditableFields } from "./inventory-api";
import { MarkSoldDialog } from "./mark-sold-dialog";

const NONE = "NONE";
const STATUS_TARGETS: ItemStatus[] = ["DRAFT", "READY", "LISTED", "OFFER_RECEIVED", "SHIPPED", "COMPLETED"];

export type QuickEditProps = {
  item: ItemListDTO | null;
  open: boolean;
  onClose: () => void;
  /** Apply an optimistic (or confirmed) replacement of the item in the list. */
  onItemChange: (item: ItemListDTO) => void;
  onItemRemoved: (id: string) => void;
};

/**
 * Quick edit: a right-hand sheet on desktop, a bottom sheet on phones. Saves optimistically and
 * offers Undo; an error puts the previous values back and keeps what the seller typed.
 */
export function QuickEditSheet({ item, open, onClose, onItemChange, onItemRemoved }: QuickEditProps) {
  return (
    <D.Root open={open && !!item} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-scrim animate-fade-in" />
        <D.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface-overlay text-primary shadow-lift focus:outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg border-t border-border-default animate-fade-up",
            "sm:inset-y-0 sm:bottom-auto sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:w-[460px] sm:rounded-none sm:border-l sm:border-t-0 sm:animate-fade-in",
          )}
          onOpenAutoFocus={(e) => {
            // Focus the title field rather than the close button.
            const el = (e.currentTarget as HTMLElement).querySelector<HTMLInputElement>("input[name=title]");
            if (el) {
              e.preventDefault();
              el.focus();
              el.select();
            }
          }}
        >
          {item && <SheetBody key={item.id} item={item} onClose={onClose} onItemChange={onItemChange} onItemRemoved={onItemRemoved} />}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function SheetBody({ item, onClose, onItemChange, onItemRemoved }: { item: ItemListDTO; onClose: () => void; onItemChange: (i: ItemListDTO) => void; onItemRemoved: (id: string) => void }) {
  const initial = useMemo(() => editableFields(item), [item]);
  const [form, setForm] = useState<EditableFields>(initial);
  const [categoryText, setCategoryText] = useState(initial.categoryPath.join(" > "));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [soldOpen, setSoldOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const sold = isSoldStatus(item.status);
  const isDemo = item.attributes.demo === true;

  useEffect(() => {
    setForm(initial);
    setCategoryText(initial.categoryPath.join(" > "));
  }, [initial]);

  const set = <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => setForm((f) => ({ ...f, [key]: value }));
  const patch = diffFields(initial, { ...form, categoryPath: categoryText.split(/\s*>\s*|\s*\/\s*/).map((s) => s.trim()).filter(Boolean) });
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    if (!dirty) return onClose();
    if (!form.title.trim()) return setErrors({ title: "Title is required" });
    if (form.floorPrice !== null && form.listPrice !== null && form.floorPrice > form.listPrice) return setErrors({ floorPrice: "Floor price cannot be higher than the list price" });
    setErrors({});
    setSaving(true);
    const before = item;
    const optimistic: ItemListDTO = {
      ...item,
      ...(patch as Partial<ItemListDTO>),
      acquiredAt: patch.acquiredAt !== undefined ? (patch.acquiredAt ? patch.acquiredAt.toISOString() : null) : item.acquiredAt,
      categoryPath: patch.categoryPath ?? item.categoryPath,
    };
    onItemChange(optimistic);
    try {
      const saved = await inventoryApi.update(item.id, patch);
      onItemChange(saved);
      const undoPatch = Object.fromEntries(Object.keys(patch).map((k) => [k, (initial as Record<string, unknown>)[k]])) as ItemUpdate;
      toast.success("Saved", {
        description: `${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? "" : "s"} updated on ${saved.title}`,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              const reverted = await inventoryApi.update(item.id, undoPatch);
              onItemChange(reverted);
              toast("Change undone");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't undo");
            }
          },
        },
      });
      onClose();
    } catch (err) {
      onItemChange(before);
      if (err instanceof InventoryApiError && err.code === "validation" && Array.isArray(err.details)) {
        const next: Record<string, string> = {};
        for (const d of err.details as Array<{ path: string; message: string }>) next[d.path] = d.message;
        setErrors(next);
      } else if (err instanceof InventoryApiError && err.code === "sku_taken") {
        setErrors({ sku: err.message });
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't save. Your edits are still here — try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (to: ItemStatus) => {
    if (to === "SOLD") return setSoldOpen(true);
    setBusyAction("status");
    try {
      const updated = await inventoryApi.setStatus(item.id, to as Exclude<ItemStatus, "SOLD" | "ANALYZING">);
      onItemChange(updated);
      toast.success(`Now ${ITEM_STATUS_META[to].label.toLowerCase()}`, { description: item.title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the status");
    } finally {
      setBusyAction(null);
    }
  };

  const archiveToggle = async () => {
    setBusyAction("archive");
    try {
      const updated = await inventoryApi.setStatus(item.id, item.status === "ARCHIVED" ? "READY" : "ARCHIVED");
      onItemChange(updated);
      toast.success(item.status === "ARCHIVED" ? "Restored" : "Archived", { description: item.title });
      if (item.status !== "ARCHIVED") onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't archive");
    } finally {
      setBusyAction(null);
    }
  };

  const remove = async () => {
    const willDelete = item.status === "DRAFT" || item.status === "ARCHIVED";
    if (!window.confirm(willDelete ? `Delete "${item.title}" and its photos? This can't be undone.` : `"${item.title}" was listed or sold, so it will be archived instead of deleted. Continue?`)) return;
    setBusyAction("delete");
    try {
      const res = await inventoryApi.remove(item.id);
      if (res.action === "deleted") {
        onItemRemoved(item.id);
        toast.success("Deleted", { description: item.title });
      } else {
        onItemChange({ ...item, status: "ARCHIVED" });
        toast.success("Archived instead of deleted", { description: "Sales history is kept." });
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    } finally {
      setBusyAction(null);
    }
  };

  const statusOptions = STATUS_TARGETS.filter((s) => s !== item.status && canTransition(item.status, s));

  return (
    <>
      <header className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
        <div className="size-14 shrink-0 overflow-hidden rounded-[8px] bg-surface-sunken">
          <CoverImage cover={item.cover} alt="" muted={sold} />
        </div>
        <div className="min-w-0 flex-1">
          <D.Title className="truncate text-base font-semibold leading-tight">{item.title}</D.Title>
          <D.Description className="mt-1 flex flex-wrap items-center gap-2 text-xs text-secondary">
            <ItemStatusBadge status={item.status} />
            <span className="font-mono">{item.sku}</span>
            <span className="tabular">{daysLabel(item.daysOnMarket)}</span>
            {isDemo && <DemoBadge className="h-5 text-[10px]" />}
          </D.Description>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions" loading={busyAction !== null}>
                <Ellipsis className="size-4" />
              </Button>
            </MenuTrigger>
            <MenuContent className="w-60">
              {!sold && canTransition(item.status, "SOLD") && (
                <MenuItem onSelect={() => setSoldOpen(true)}>
                  <CircleDollarSign className="size-4" /> Mark sold…
                </MenuItem>
              )}
              {statusOptions.length > 0 && (
                <>
                  <MenuLabel>Move to</MenuLabel>
                  {statusOptions.map((s) => (
                    <MenuItem key={s} onSelect={() => changeStatus(s)}>
                      {ITEM_STATUS_META[s].label}
                      <span className="ml-auto truncate pl-3 text-xs text-muted">{ITEM_STATUS_META[s].description}</span>
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                </>
              )}
              {(item.status === "ARCHIVED" || canTransition(item.status, "ARCHIVED")) && (
                <MenuItem onSelect={archiveToggle}>
                  {item.status === "ARCHIVED" ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                  {item.status === "ARCHIVED" ? "Restore from archive" : "Archive"}
                </MenuItem>
              )}
              <MenuItem destructive onSelect={remove}>
                <Trash2 className="size-4" /> {item.status === "DRAFT" || item.status === "ARCHIVED" ? "Delete" : "Delete (archives)"}
              </MenuItem>
            </MenuContent>
          </Menu>
          <D.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X className="size-4" />
            </Button>
          </D.Close>
        </div>
      </header>

      <form
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA" && !(e.target as HTMLElement).closest("[role=combobox]")) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border-subtle bg-surface-sunken/60 px-3 py-2 text-sm">
          <div>
            <div className="text-xs text-muted">{sold ? "Sold for" : item.listPrice !== null ? "List price" : "Estimate"}</div>
            <Money cents={sold ? item.soldPrice : item.listPrice ?? item.estimatedValue} className="text-base font-semibold" />
          </div>
          {item.estimate && (
            <div className="text-right">
              <div className="text-xs text-muted">{item.estimate.basis === "MARKET_EVIDENCE" ? "Market estimate" : "AI estimate"}</div>
              <div className="flex items-center justify-end gap-2">
                <Money cents={item.estimate.recommended} className="text-sm" />
                <ConfidenceBadge tier={item.estimate.confidence} className="h-5 text-[10px]" />
              </div>
            </div>
          )}
          <MarketplaceDots publications={item.publications} soldMarketplace={item.soldMarketplace} />
        </div>

        <Field label="Title" error={errors.title}>{(p) => <Input {...p} name="title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" error={errors.brand}>{(p) => <Input {...p} value={form.brand ?? ""} onChange={(e) => set("brand", e.target.value || null)} maxLength={120} />}</Field>
          <Field label="Model" error={errors.model}>{(p) => <Input {...p} value={form.model ?? ""} onChange={(e) => set("model", e.target.value || null)} maxLength={120} />}</Field>
        </div>
        <Field label="Category" hint="Broad to specific, separated by >" error={errors.categoryPath}>{(p) => <Input {...p} value={categoryText} onChange={(e) => setCategoryText(e.target.value)} placeholder="Cameras & Photo > Film Cameras" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Condition" error={errors.conditionGrade}>{(p) => <Select id={p.id} value={form.conditionGrade ?? NONE} onValueChange={(v) => set("conditionGrade", v === NONE ? null : (v as ConditionGrade))} options={[{ value: NONE, label: "Not graded" }, ...CONDITION_OPTIONS]} />}</Field>
          <Field label="Quantity" error={errors.quantity}>{(p) => <Input {...p} type="number" min={0} max={10000} inputMode="numeric" className="tabular" value={form.quantity} onChange={(e) => set("quantity", Math.max(0, Math.floor(Number(e.target.value) || 0)))} />}</Field>
        </div>
        <Field label="Condition notes" error={errors.conditionNotes}>{(p) => <Textarea {...p} value={form.conditionNotes ?? ""} onChange={(e) => set("conditionNotes", e.target.value || null)} rows={2} className="min-h-16" maxLength={2000} />}</Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="List price" error={errors.listPrice}>{(p) => <MoneyInput {...p} valueCents={form.listPrice} onChangeCents={(c) => set("listPrice", c)} disabled={sold} />}</Field>
          <Field label="Floor" error={errors.floorPrice}>{(p) => <MoneyInput {...p} valueCents={form.floorPrice} onChangeCents={(c) => set("floorPrice", c)} disabled={sold} />}</Field>
          <Field label="Paid" error={errors.acquisitionCost}>{(p) => <MoneyInput {...p} valueCents={form.acquisitionCost} onChangeCents={(c) => set("acquisitionCost", c)} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Storage location" error={errors.storageLocation}>{(p) => <Input {...p} value={form.storageLocation ?? ""} onChange={(e) => set("storageLocation", e.target.value || null)} placeholder="Shelf B2" maxLength={120} />}</Field>
          <Field label="Acquired" error={errors.acquiredAt}>{(p) => <Input {...p} type="date" value={toDateInput(form.acquiredAt)} onChange={(e) => set("acquiredAt", fromDateInput(e.target.value))} />}</Field>
        </div>
        <Field label="SKU" hint="Letters, numbers, dashes, dots. Unique to you." error={errors.sku}>{(p) => <Input {...p} value={form.sku} onChange={(e) => set("sku", e.target.value)} className="font-mono" maxLength={40} />}</Field>
        <Field label="Private notes" error={errors.notes}>{(p) => <Textarea {...p} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} rows={3} maxLength={4000} />}</Field>
        <button type="submit" className="sr-only">
          Save
        </button>
      </form>

      <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-3 safe-bottom">
        <Link href={`/items/${item.id}`} className={buttonClasses("link", "sm", "gap-1")} onClick={onClose}>
          Open item <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
        <div className="flex items-center gap-2">
          <D.Close asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </D.Close>
          <Button size="sm" onClick={() => void save()} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </div>
      </footer>

      <MarkSoldDialog
        item={item}
        open={soldOpen}
        onClose={() => setSoldOpen(false)}
        onSold={(u) => {
          onItemChange(u);
          onClose();
        }}
      />
    </>
  );
}
