"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, MoneyInput } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/switch";
import type { Marketplace } from "@/lib/db";
import type { ItemListDTO } from "@/lib/inventory/types";
import { ALL_MARKETPLACES, estimateFees, MARKETPLACES } from "@/lib/marketplaces/registry";
import { inventoryApi } from "./inventory-api";

const NONE = "NONE";

/**
 * Records a sale. Fees default to the marketplace's published rate (labelled as an estimate and
 * editable). Explains up front what happens to the item's other live listings.
 */
export function MarkSoldDialog({ item, open, onClose, onSold }: { item: ItemListDTO; open: boolean; onClose: () => void; onSold: (updated: ItemListDTO) => void }) {
  const live = item.publications.filter((p) => ["PUBLISHED", "REQUIRES_USER_ACTION", "NEEDS_ATTENTION", "PUBLISHING", "READY"].includes(p.status));
  const defaultMarketplace = live[0]?.marketplace ?? item.publications[0]?.marketplace ?? null;
  const [price, setPrice] = useState<number | null>(item.listPrice ?? item.estimatedValue);
  const [marketplace, setMarketplace] = useState<Marketplace | null>(defaultMarketplace);
  const [local, setLocal] = useState(false);
  const [fees, setFees] = useState<number | null>(null);
  const [feesTouched, setFeesTouched] = useState(false);
  const [shipping, setShipping] = useState<number | null>(item.shippingCost);
  const [buyer, setBuyer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedFees = useMemo(() => (marketplace && price ? estimateFees(marketplace, price, { local }) : 0), [marketplace, price, local]);
  useEffect(() => {
    if (!feesTouched) setFees(marketplace ? estimatedFees : null);
  }, [estimatedFees, feesTouched, marketplace]);

  const others = live.filter((p) => p.marketplace !== marketplace);
  const assisted = others.filter((p) => p.mode === "ASSISTED");
  const api = others.filter((p) => p.mode === "API");
  const net = price !== null ? price - (fees ?? 0) - (shipping ?? 0) - (item.acquisitionCost ?? 0) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price || price < 1) {
      setError("Enter the sold price.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await inventoryApi.markSold(item.id, {
        soldPriceCents: price,
        marketplace: marketplace ?? undefined,
        feesCents: fees ?? undefined,
        shippingCostCents: shipping ?? undefined,
        buyerName: buyer.trim() || undefined,
        local,
      });
      onSold(res.item);
      const queued = res.guarded.filter((g) => g.action === "queued_end").map((g) => MARKETPLACES[g.marketplace as Marketplace].name);
      const manual = res.guarded.filter((g) => g.action === "user_action").map((g) => MARKETPLACES[g.marketplace as Marketplace].name);
      toast.success(`Sold — ${item.title}`, {
        description: [queued.length ? `Ending on ${queued.join(", ")} for you.` : null, manual.length ? `End the ${manual.join(" and ")} listing${manual.length > 1 ? "s" : ""} yourself — it's in Needs attention.` : null].filter(Boolean).join(" ") || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the sale. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Mark as sold" description={item.title} size="md">
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sold price" error={error}>{(p) => <MoneyInput {...p} valueCents={price} onChangeCents={setPrice} autoFocus required />}</Field>
            <Field label="Sold on">
              {(p) => (
                <Select
                  id={p.id}
                  value={marketplace ?? NONE}
                  onValueChange={(v) => setMarketplace(v === NONE ? null : (v as Marketplace))}
                  options={[
                    { value: NONE, label: "Elsewhere / in person" },
                    ...ALL_MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACES[m].name, description: live.some((l) => l.marketplace === m) ? "Live listing" : undefined })),
                  ]}
                />
              )}
            </Field>
          </div>
          {marketplace && MARKETPLACES[marketplace].fees.localFree && (
            <label className="flex items-center gap-2 text-sm text-primary">
              <Checkbox checked={local} onCheckedChange={(v) => setLocal(v === true)} />
              Local pickup (no marketplace fee on {MARKETPLACES[marketplace].shortName})
            </label>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fees" hint={marketplace && !feesTouched ? `Estimate from ${MARKETPLACES[marketplace].shortName}'s published rate — edit if your statement differs.` : "What the marketplace kept."} optional>
              {(p) => (
                <MoneyInput
                  {...p}
                  valueCents={fees}
                  onChangeCents={(c) => {
                    setFeesTouched(true);
                    setFees(c);
                  }}
                />
              )}
            </Field>
            <Field label="Your shipping cost" optional>{(p) => <MoneyInput {...p} valueCents={shipping} onChangeCents={setShipping} />}</Field>
          </div>
          <Field label="Buyer" optional>{(p) => <Input {...p} value={buyer} onChange={(e) => setBuyer(e.target.value)} maxLength={120} autoComplete="off" />}</Field>

          <dl className="grid grid-cols-2 gap-y-1 rounded-sm border border-border-subtle bg-surface-sunken/60 px-4 py-3 text-sm">
            <dt className="text-secondary">Take-home</dt>
            <dd className="text-right font-semibold tabular text-primary">
              <Money cents={price !== null ? price - (fees ?? 0) - (shipping ?? 0) : null} />
            </dd>
            <dt className="text-secondary">Profit after cost{item.acquisitionCost === null ? " (no cost recorded)" : ""}</dt>
            <dd className={`text-right tabular ${net !== null && net < 0 ? "text-danger" : "text-primary"}`}>
              <Money cents={net} />
            </dd>
          </dl>

          {others.length > 0 && (
            <div className="rounded-sm border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-primary">
              <p className="font-medium">Sold only once</p>
              <ul className="mt-1 space-y-0.5 text-secondary">
                {api.map((p) => (
                  <li key={p.id}>Clover will end the {MARKETPLACES[p.marketplace].name} listing through its API.</li>
                ))}
                {assisted.map((p) => (
                  <li key={p.id}>You&apos;ll be asked to end the {MARKETPLACES[p.marketplace].name} listing yourself — Clover never operates that site for you.</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Record sale
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
